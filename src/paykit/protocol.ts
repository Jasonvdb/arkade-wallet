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
 * are added to `EngineCalls` and new callbacks to `HostCalls`; the client and the worker are typed from them.
 */
import type { EndpointSupport, RailOutcome, RailPayment, RailProofCheck, StartResult } from './pkg/paykit_wasm'

export type { EndpointSupport, RailOutcome, RailPayment, RailProofCheck, StartResult }

/** The engine's `start` options without the callbacks, which the worker builds on host messages. */
export interface WorkerStartArgs {
  identitySecretHex: string
  dispatchOrigin: string
  dispatchListener?: string
  storePrefix?: string
  clientId?: string
  endpoints: EndpointSupport[]
}

export interface EngineCalls {
  start: { args: WorkerStartArgs; result: StartResult }
  identity: { args: undefined; result: string }
  stop: { args: undefined; result: null }
  version: { args: undefined; result: string }
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

/** What the engine reports outside a call's answer. Contacts, requests and lists add their own kinds. */
export type EngineEvent = { type: 'started'; result: StartResult } | { type: 'stopped' }

export type Failure = { ok: false; error: string }

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
