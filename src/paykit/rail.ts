import type { RailOutcome, RailPayment, RailProofCheck } from './protocol'

/**
 * The wallet's payment method as the engine sees it, on the page (it needs the wallet service). The
 * identifiers and their fraction digits are declared in the config; these are the calls the engine
 * cannot answer by itself.
 */
export interface PageRail {
  /** Pays `payment` once per `attemptId` (idempotent): paid with a `{txid}` proof, failed, or pending. */
  pay(payment: RailPayment): Promise<RailOutcome>
  /** The outcome of an earlier `pay`, or `null` when `pay` never ran with that attempt. */
  payment(attemptId: string): Promise<RailOutcome | null>
  /** The time a received payment was seen, in Unix milliseconds, or `null` when the proof does not hold. */
  verify(check: RailProofCheck): Promise<number | null>
}

/**
 * The rail until paying and verifying are wired to the wallet: it pays nothing (a definite failure, with
 * nothing sent) and verifies nothing.
 */
export const noPaymentsRail: PageRail = {
  pay: async () => ({ status: 'failed' }),
  payment: async () => null,
  verify: async () => null,
}
