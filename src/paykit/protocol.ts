/**
 * The messages between the page and the Paykit worker.
 *
 *   page -> worker   {kind: 'call', id, op, args}            run an engine call
 *   worker -> page   {kind: 'result', id, ok, value | error} its answer
 *   worker -> page   {kind: 'event', event}                  something the engine reports by itself
 *   worker -> page   {kind: 'host', id, op, args}            the engine needs the page (Homeserver, rail)
 *   page -> worker   {kind: 'hostResult', id, ok, value | error}
 *   worker -> page   {kind: 'loaded', version}               the engine module is instantiated
 *   worker -> page   {kind: 'fatal', error}                  the engine aborted; replace the worker
 *
 * The Homeserver and the rail run on the page, which owns the wallet and the Pubky session. New engine calls
 * are added to `EngineCalls` and to the worker's `CALLS` table, new callbacks to `HostCalls`; the client and
 * the worker are typed from them. `pkg/API.md` documents every engine call and event.
 */
import type {
  Contacts,
  EndpointSupport,
  EngineEvent as PkgEngineEvent,
  ListEndpoint,
  OneTimeRequest,
  PayeeRequest,
  PayRequestOptions,
  PaymentEntry,
  PaymentOutcome,
  RailOutcome,
  RailPayment,
  RailProofCheck,
  Receipt,
  ReceivedList,
  ReceiveResult,
  RequestId,
  RequestInput,
  SentRequest,
  SharedList,
  SignerTick,
  StartResult,
} from './pkg/paykit_wasm'

export type {
  Contacts,
  EndpointSupport,
  ListEndpoint,
  OneTimeRequest,
  PayeeRequest,
  PayRequestOptions,
  PaymentEntry,
  PaymentOutcome,
  RailOutcome,
  RailPayment,
  RailProofCheck,
  Receipt,
  ReceivedList,
  RequestId,
  RequestInput,
  SentRequest,
  SharedList,
  StartResult,
}

/** The engine's `start` options without the callbacks, which the worker builds on host messages. */
export interface WorkerStartArgs {
  identitySecretHex: string
  dispatchOrigin: string
  dispatchListener?: string
  storePrefix?: string
  clientId?: string
  endpoints: EndpointSupport[]
  /** How long `payRequest` waits for the rail's `pay` before it answers `pending`. */
  payLimitMs?: number
}

/** Each engine call with its argument (calls that take two take an object) and its result. */
export interface EngineCalls {
  start: { args: WorkerStartArgs; result: StartResult }
  identity: { args: undefined; result: string }
  stop: { args: undefined; result: null }
  version: { args: undefined; result: string }
  // Contacts and admission
  allowConnect: { args: string; result: null }
  admits: { args: string; result: boolean }
  contacts: { args: undefined; result: Contacts }
  probeAdmission: { args: string; result: string }
  messageDelivery: { args: string; result: string | null }
  // Payer
  requests: { args: undefined; result: OneTimeRequest[] }
  payRequest: { args: { id: RequestId; options?: PayRequestOptions }; result: PaymentOutcome }
  rejectRequest: { args: { id: RequestId; reason?: string }; result: string }
  payments: { args: undefined; result: PaymentEntry[] }
  requestReceipts: { args: RequestId; result: Receipt[] }
  resumePayments: { args: undefined; result: PaymentOutcome[] }
  // Payee
  sendRequest: { args: RequestInput; result: SentRequest }
  payeeActivity: { args: undefined; result: PayeeRequest[] }
  verifyPayment: { args: string; result: number | null }
  confirmPayment: { args: string; result: string | null }
  cancelSentRequest: { args: { record: string; reason?: string }; result: string }
  // Private Payment Lists
  setListEndpoints: { args: ListEndpoint[]; result: null }
  publishListTo: { args: string; result: null }
  withdrawListFrom: { args: string; result: null }
  sharedList: { args: undefined; result: SharedList }
  receivedLists: { args: undefined; result: ReceivedList[] }
  // Feed and signer: the engine's own feed loop runs both while it is started.
  receive: { args: undefined; result: ReceiveResult }
  signerTick: { args: undefined; result: SignerTick }
  /** Development builds only: makes the worker fail as a panic would, to exercise the restart. */
  crashForTest: { args: undefined; result: null }
}
export type EngineOp = keyof EngineCalls

export interface HostCalls {
  'hs.get': { args: { identity: string; path: string }; result: Uint8Array | null }
  'hs.put': { args: { path: string; bytes: Uint8Array }; result: null }
  'hs.delete': { args: { path: string }; result: null }
  'rail.pay': { args: RailPayment; result: RailOutcome }
  'rail.payment': { args: { attemptId: string }; result: RailOutcome | null }
  'rail.verify': { args: RailProofCheck; result: number | null }
}
export type HostOp = keyof HostCalls

/**
 * What the engine reports outside a call's answer: its own events (`pkg/API.md` section 7, such as
 * `admissionChanged`, `messageReceived` and `requestReceived`), and `started` / `stopped` from the worker.
 */
export type EngineEvent = PkgEngineEvent | { type: 'started'; result: StartResult } | { type: 'stopped' }

/** A failed call or callback: the error's message, and for engine errors its `code` and refusal `reason`. */
export type Failure = { ok: false; error: string; code?: string | null; reason?: string | null }

export type PageToWorker =
  | { [O in EngineOp]: { kind: 'call'; id: number; op: O; args: EngineCalls[O]['args'] } }[EngineOp]
  | ({ kind: 'hostResult'; id: number } & ({ ok: true; value: unknown } | Failure))

export type WorkerToPage =
  | ({ kind: 'result'; id: number } & ({ ok: true; value: unknown } | Failure))
  | { kind: 'event'; event: EngineEvent }
  | { [O in HostOp]: { kind: 'host'; id: number; op: O; args: HostCalls[O]['args'] } }[HostOp]
  | { kind: 'loaded'; version: string }
  | { kind: 'fatal'; error: string }

/** The `<code>` of an engine error (`Error("<code>: <text>")`), such as `store` or `enrolment`. */
export const engineErrorCode = (message: string): string | undefined => /^([a-z_]+): /.exec(message)?.[1]

/** An engine call's failure on the page: `code` as `pkg/API.md` section 8 lists it, `reason` for `refused`. */
export class PaykitCallError extends Error {
  readonly code?: string
  readonly reason?: string
  constructor(message: string, code?: string | null, reason?: string | null) {
    super(message)
    this.name = 'PaykitCallError'
    this.code = code ?? engineErrorCode(message)
    this.reason = reason ?? undefined
  }
}
