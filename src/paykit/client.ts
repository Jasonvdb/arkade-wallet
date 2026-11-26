import {
  engineErrorCode,
  PaykitCallError,
  type EngineCalls,
  type EngineEvent,
  type EngineOp,
  type HostCalls,
  type HostOp,
  type PageToWorker,
  type StartResult,
  type WorkerStartArgs,
  type WorkerToPage,
} from './protocol'

export type HostHandlers = { [O in HostOp]: (args: HostCalls[O]['args']) => Promise<HostCalls[O]['result']> }

/** What happens to the worker outside the calls: the provider turns these into its status. */
export type Lifecycle =
  | { type: 'crashed'; error: string }
  | { type: 'restarted'; result: StartResult }
  | { type: 'gave-up'; error: string }

export interface PaykitClientOptions {
  host: HostHandlers
  onEvent?: (event: EngineEvent) => void
  onLifecycle?: (change: Lifecycle) => void
  /** Builds the worker; tests may pass their own. */
  createWorker?: () => Worker
}

/** The engine's worker died (a panic aborts the wasm instance) or was replaced. */
export class PaykitWorkerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaykitWorkerError'
  }
}

const createPaykitWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'paykit' })

const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 5 * 60_000
const STORE_RETRIES = 5

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The page's side of the Paykit worker: typed calls, the host callbacks, and recovery. When the worker dies,
 * every pending call is rejected, a new worker is made, and the engine is started again with the same
 * options, which reopens it from its stores (`enrolment: "loaded"`). After `MAX_RESTARTS` crashes within
 * `RESTART_WINDOW_MS` it gives up.
 */
export class PaykitClient {
  private worker?: Worker
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private startArgs?: WorkerStartArgs
  private crashes: number[] = []
  private disposed = false
  private restarting = false

  constructor(private readonly options: PaykitClientOptions) {
    this.spawn()
  }

  /** Runs one engine call. */
  call<O extends EngineOp>(op: O, args: EngineCalls[O]['args']): Promise<EngineCalls[O]['result']> {
    const worker = this.worker
    if (this.disposed || !worker) return Promise.reject(new PaykitWorkerError('the Paykit worker is not running'))
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      worker.postMessage({ kind: 'call', id, op, args } as PageToWorker)
    })
  }

  /**
   * Starts the engine, and keeps the options to start it again after a crash. A `store` error is tried
   * again for a few seconds: a worker that was just replaced may still hold the OPFS files.
   */
  async start(args: WorkerStartArgs): Promise<StartResult> {
    this.startArgs = args
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.call('start', args)
      } catch (error) {
        const code = error instanceof Error ? engineErrorCode(error.message) : undefined
        if (code !== 'store' || attempt >= STORE_RETRIES || this.disposed) throw error
        await sleep(500 * (attempt + 1))
      }
    }
  }

  /** Stops the engine (it releases its stores) and the worker. The client cannot be used afterwards. */
  async stop(): Promise<void> {
    if (this.disposed) return
    this.startArgs = undefined
    try {
      await this.call('stop', undefined)
    } catch {
      // not started, or already gone: the worker is terminated either way
    }
    this.dispose()
  }

  /** Terminates the worker at once and rejects every pending call. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.startArgs = undefined
    this.teardown(new PaykitWorkerError('the Paykit worker was stopped'))
  }

  private spawn() {
    const worker = (this.options.createWorker ?? createPaykitWorker)()
    worker.onmessage = (event: MessageEvent<WorkerToPage>) => this.receive(worker, event.data)
    worker.onerror = (event) => {
      event.preventDefault()
      this.crashed(worker, event.message || 'the Paykit worker failed')
    }
    worker.onmessageerror = () => this.crashed(worker, 'the Paykit worker sent a message that could not be read')
    this.worker = worker
  }

  private teardown(reason: Error) {
    this.worker?.terminate()
    this.worker = undefined
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const call of pending) call.reject(reason)
  }

  private receive(worker: Worker, message: WorkerToPage) {
    if (worker !== this.worker) return
    switch (message.kind) {
      case 'result': {
        const call = this.pending.get(message.id)
        if (!call) return
        this.pending.delete(message.id)
        if (message.ok) call.resolve(message.value)
        else call.reject(new PaykitCallError(message.error, message.code, message.reason))
        return
      }
      case 'event':
        this.options.onEvent?.(message.event)
        return
      case 'host':
        this.answerHost(worker, message.id, message.op, message.args)
        return
      case 'fatal':
        this.crashed(worker, message.error)
        return
      case 'loaded':
        return
    }
  }

  private answerHost<O extends HostOp>(worker: Worker, id: number, op: O, args: HostCalls[O]['args']) {
    const handler = this.options.host[op] as (args: HostCalls[O]['args']) => Promise<unknown>
    Promise.resolve()
      .then(() => handler(args))
      .then(
        (value) => {
          if (worker === this.worker) worker.postMessage({ kind: 'hostResult', id, ok: true, value: value ?? null })
        },
        (error) => {
          const text = error instanceof Error ? error.message : String(error)
          if (worker === this.worker) worker.postMessage({ kind: 'hostResult', id, ok: false, error: text })
        },
      )
  }

  private crashed(worker: Worker, error: string) {
    if (worker !== this.worker || this.disposed) return
    this.teardown(new PaykitWorkerError(`the Paykit worker stopped: ${error}`))
    this.options.onLifecycle?.({ type: 'crashed', error })
    void this.restart(error)
  }

  private async restart(firstError: string) {
    // A crash while restarting shows up here as the start's rejection, and goes round the loop again.
    if (this.restarting) return
    this.restarting = true
    let error = firstError
    try {
      for (;;) {
        const args = this.startArgs
        if (!args || this.disposed) return
        const now = Date.now()
        this.crashes = [...this.crashes.filter((at) => now - at < RESTART_WINDOW_MS), now]
        if (this.crashes.length > MAX_RESTARTS) {
          this.options.onLifecycle?.({ type: 'gave-up', error })
          return
        }
        await sleep(250 * this.crashes.length)
        if (this.disposed) return
        this.spawn()
        try {
          const result = await this.start(args)
          if (!this.disposed) this.options.onLifecycle?.({ type: 'restarted', result })
          return
        } catch (failure) {
          if (this.disposed) return
          error = failure instanceof Error ? failure.message : String(failure)
          if (failure instanceof PaykitWorkerError) continue
          this.options.onLifecycle?.({ type: 'gave-up', error })
          return
        }
      }
    } finally {
      this.restarting = false
    }
  }
}
