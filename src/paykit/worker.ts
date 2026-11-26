/* eslint-disable spaced-comment */
/// <reference lib="webworker" />
/* eslint-enable spaced-comment */
/**
 * The Paykit worker: a dedicated module worker that owns the wasm engine (one engine per worker). The engine
 * keeps its state in OPFS, which only a dedicated worker can open synchronously. Every Homeserver and rail
 * callback is forwarded to the page. See `protocol.ts` for the messages.
 */
import init, { identity, start, stop, version } from './pkg/paykit_wasm.js'
import type {
  EngineCalls,
  EngineEvent,
  EngineOp,
  HostCalls,
  HostOp,
  PageToWorker,
  WorkerStartArgs,
  WorkerToPage,
} from './protocol'

declare const self: DedicatedWorkerGlobalScope

const post = (message: WorkerToPage) => self.postMessage(message)
const emit = (event: EngineEvent) => post({ kind: 'event', event })

/** A panic aborts the wasm instance: every later call would trap. Tell the page, which replaces the worker. */
const fatal = (error: unknown) => {
  post({ kind: 'fatal', error: describe(error) })
  self.close()
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isTrap = (error: unknown): boolean => error instanceof WebAssembly.RuntimeError

const loaded = init({ module_or_path: new URL('./pkg/paykit_wasm_bg.wasm', import.meta.url) }).then(
  () => post({ kind: 'loaded', version: version() }),
  (error) => fatal(error),
)

// Host calls: the engine awaits the page's answer. The engine puts its own time limit on each one.
let nextHostId = 1
const pendingHost = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

const host = <O extends HostOp>(op: O, args: HostCalls[O]['args']): Promise<HostCalls[O]['result']> =>
  new Promise((resolve, reject) => {
    const id = nextHostId++
    pendingHost.set(id, { resolve: resolve as (value: unknown) => void, reject })
    post({ kind: 'host', id, op, args } as WorkerToPage)
  })

const engineOptions = (args: WorkerStartArgs) => ({
  identitySecretHex: args.identitySecretHex,
  dispatchOrigin: args.dispatchOrigin,
  dispatchListener: args.dispatchListener,
  storePrefix: args.storePrefix,
  clientId: args.clientId,
  homeserver: {
    get: async (identityZ32: string, path: string) => {
      const bytes = await host('hs.get', { identity: identityZ32, path })
      return bytes ? new Uint8Array(bytes) : null
    },
    put: async (path: string, bytes: Uint8Array) => {
      await host('hs.put', { path, bytes: new Uint8Array(bytes) })
    },
    delete: async (path: string) => {
      await host('hs.delete', { path })
    },
  },
  rail: {
    endpoints: args.endpoints,
    pay: (payment: HostCalls['rail.pay']['args']) => host('rail.pay', payment),
    payment: (attemptId: string) => host('rail.payment', { attemptId }),
    verify: (check: HostCalls['rail.verify']['args']) => host('rail.verify', check),
  },
})

const run = async <O extends EngineOp>(op: O, args: EngineCalls[O]['args']): Promise<unknown> => {
  await loaded
  switch (op) {
    case 'start': {
      const result = await start(engineOptions(args as WorkerStartArgs))
      emit({ type: 'started', result })
      return result
    }
    case 'identity':
      return identity()
    case 'stop':
      await stop()
      emit({ type: 'stopped' })
      return null
    case 'version':
      return version()
    case 'crashForTest':
      if (!import.meta.env.DEV) throw new Error('crashForTest is a development call')
      // Thrown outside any handler, as an abort would be: the page sees the worker's error event.
      setTimeout(() => {
        throw new Error('the Paykit worker was crashed on purpose')
      })
      return null
    default:
      throw new Error(`unknown call ${String(op)}`)
  }
}

self.onmessage = async (event: MessageEvent<PageToWorker>) => {
  const message = event.data
  if (message.kind === 'hostResult') {
    const pending = pendingHost.get(message.id)
    if (!pending) return
    pendingHost.delete(message.id)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new Error(message.error))
    return
  }
  const { id, op, args } = message
  try {
    const value = await run(op, args)
    post({ kind: 'result', id, ok: true, value: value ?? null })
  } catch (error) {
    post({ kind: 'result', id, ok: false, error: describe(error) })
    if (isTrap(error)) fatal(error)
  }
}

self.addEventListener('unhandledrejection', (event) => {
  if (isTrap(event.reason)) fatal(event.reason)
})
