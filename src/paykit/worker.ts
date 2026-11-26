/* eslint-disable spaced-comment */
/// <reference lib="webworker" />
/* eslint-enable spaced-comment */
/**
 * The Paykit worker: a dedicated module worker that owns the wasm engine (one engine per worker). The engine
 * keeps its state in OPFS, which only a dedicated worker can open synchronously. Every Homeserver and rail
 * callback is forwarded to the page. See `protocol.ts` for the messages.
 */
import init, * as engine from './pkg/paykit_wasm.js'
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

/** The error's code and refusal reason, which the engine sets on its `Error`s (`pkg/API.md` section 8). */
const failure = (error: unknown) => {
  const fields = error && typeof error === 'object' ? (error as { code?: unknown; reason?: unknown }) : {}
  return {
    error: describe(error),
    code: typeof fields.code === 'string' ? fields.code : null,
    reason: typeof fields.reason === 'string' ? fields.reason : null,
  }
}

/** A panic aborts the wasm instance: every later call would trap. Tell the page, which replaces the worker. */
const fatal = (error: unknown) => {
  post({ kind: 'fatal', error: describe(error) })
  self.close()
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isTrap = (error: unknown): boolean => error instanceof WebAssembly.RuntimeError

const loaded = init({ module_or_path: new URL('./pkg/paykit_wasm_bg.wasm', import.meta.url) }).then(
  () => post({ kind: 'loaded', version: engine.version() }),
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
  // The engine's own feed loop receives, sends, resumes payments and runs the signer's due work (once a
  // minute) for as long as the engine is started, that is while the wallet is open in this tab.
  autoReceive: true,
  onEvent: (event: EngineEvent) => emit(event),
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

type Calls = { [O in EngineOp]: (args: EngineCalls[O]['args']) => Promise<unknown> | unknown }

/** Each engine call, from the page's single argument to the engine's parameters. */
const CALLS: Calls = {
  start: async (args) => {
    const result = await engine.start(engineOptions(args))
    emit({ type: 'started', result })
    return result
  },
  identity: () => engine.identity(),
  stop: async () => {
    await engine.stop()
    emit({ type: 'stopped' })
    return null
  },
  version: () => engine.version(),
  allowConnect: (identity) => engine.allowConnect(identity),
  admits: (identity) => engine.admits(identity),
  contacts: () => engine.contacts(),
  probeAdmission: (identity) => engine.probeAdmission(identity),
  messageDelivery: (msgId) => engine.messageDelivery(msgId),
  requests: () => engine.requests(),
  payRequest: ({ id, options }) => engine.payRequest(id, options),
  rejectRequest: ({ id, reason }) => engine.rejectRequest(id, reason),
  payments: () => engine.payments(),
  requestReceipts: (id) => engine.requestReceipts(id),
  resumePayments: () => engine.resumePayments(),
  sendRequest: (request) => engine.sendRequest(request),
  payeeActivity: () => engine.payeeActivity(),
  verifyPayment: (record) => engine.verifyPayment(record),
  confirmPayment: (record) => engine.confirmPayment(record),
  cancelSentRequest: ({ record, reason }) => engine.cancelSentRequest(record, reason),
  setListEndpoints: (endpoints) => engine.setListEndpoints(endpoints),
  publishListTo: (identity) => engine.publishListTo(identity),
  withdrawListFrom: (identity) => engine.withdrawListFrom(identity),
  sharedList: () => engine.sharedList(),
  receivedLists: () => engine.receivedLists(),
  receive: () => engine.receive(),
  signerTick: () => engine.signerTick(),
  crashForTest: () => {
    if (!import.meta.env.DEV) throw new Error('crashForTest is a development call')
    // Thrown outside any handler, as an abort would be: the page sees the worker's error event.
    setTimeout(() => {
      throw new Error('the Paykit worker was crashed on purpose')
    })
    return null
  },
}

const run = async <O extends EngineOp>(op: O, args: EngineCalls[O]['args']): Promise<unknown> => {
  await loaded
  const call = CALLS[op] as ((args: EngineCalls[O]['args']) => unknown) | undefined
  if (!call) throw new Error(`unknown call ${String(op)}`)
  return await call(args)
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
    post({ kind: 'result', id, ok: false, ...failure(error) })
    if (isTrap(error)) fatal(error)
  }
}

self.addEventListener('unhandledrejection', (event) => {
  if (isTrap(event.reason)) fatal(event.reason)
})
