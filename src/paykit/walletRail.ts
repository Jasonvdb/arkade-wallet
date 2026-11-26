import type { IntentFeeConfig, IWallet, RouteQuote } from '@arkade-os/sdk'
import { createSendRouter, fundedResult, WALLET_EXIT_RAIL } from '../lib/sendRouter'
import { consoleError } from '../lib/logs'
import { paykitConfig } from './config'
import { paykitErrorText } from './errors'
import { btcToSats } from './contacts'
import type { RailOutcome, RailPayment } from './protocol'
import type { PageRail } from './rail'
import { verifyProof } from './receive'

/**
 * The wallet's payment method for Paykit: it pays a Payment Request on-chain by a collaborative exit, the
 * wallet's own on-chain send (`WALLET_EXIT_RAIL`), and nothing else. The swap rail that the send screen
 * prefers is never used here: its txid is a funding transaction, not one that pays the payee's address.
 *
 * Safety rules, for auditing:
 * - It pays only what the user approved on the send screen: an approval names the address, the amount and
 *   the most the wallet may spend in all (amount plus fees). A `pay` without a matching approval, or whose
 *   quote costs more, sends nothing and fails.
 * - The exit pays exactly the requested amount to the address (one output); fees come on top. The proof is
 *   the txid of the batch transaction that holds that output.
 * - One record per attempt ID (localStorage, per Pubky identity), written before the exit starts, so a
 *   repeat or a restart answers from the record and never pays twice.
 */

/** What paying by collaborative exit needs from the wallet; read when a payment runs. */
export interface ExitDeps {
  wallet: IWallet
  outputFee: () => number
  intentFee: () => IntentFeeConfig | undefined
  dust: () => number
}

/** Where an attempt stands on this device. `unknown`: the exit failed in a way that may have spent coins. */
export type AttemptStatus = 'paying' | 'paid' | 'failed' | 'unknown'

export interface AttemptRecord {
  status: AttemptStatus
  endpointId: string
  address: string
  sats: number
  startedAtMs: number
  /** The Payment Request it pays (`payee/requestHash`), from the approval. */
  requestKey?: string
  txid?: string
  fee?: number
  paidAtMs?: number
  error?: string
}

/** The steps a payment goes through, for the send screen's progress. */
export type PayStage = 'preparing' | 'batch' | 'paid' | 'failed'

export interface PayProgress {
  /** The approval it belongs to (`approvalKey`). */
  key: string
  stage: PayStage
  attemptId: string
  txid?: string
  /** Why it failed, in words for the user (never an error's own message). */
  error?: string
}

interface Approval {
  requestKey: string
  maxTotal: number
  expiresAtMs: number
}

/** An approval stays valid this long: enough for a batch round, not for a forgotten tab. */
const APPROVAL_TTL_MS = 10 * 60_000

const TXID = /^[0-9a-f]{64}$/

/** The key an approval and its progress go by: one payment of `sats` to `address`. */
export const approvalKey = (address: string, sats: number): string => `${address}|${sats}`

const approvals = new Map<string, Approval>()
const progressListeners = new Set<(progress: PayProgress) => void>()
const lastProgress = new Map<string, PayProgress>()

/**
 * The user approved paying `sats` to `address` for the request `requestKey`, at most `maxTotal` leaving the
 * wallet. Called by the send screen right before it asks the engine to pay the request.
 */
export const approvePayment = (address: string, sats: number, maxTotal: number, requestKey: string): void => {
  const key = approvalKey(address, sats)
  approvals.set(key, { requestKey, maxTotal, expiresAtMs: Date.now() + APPROVAL_TTL_MS })
  lastProgress.delete(key)
}

/** Withdraws an approval, once the payment it was for is decided. */
export const withdrawApproval = (address: string, sats: number): void => {
  approvals.delete(approvalKey(address, sats))
}

/** Follows the payments' progress; returns the unsubscribe. */
export const subscribePayProgress = (listener: (progress: PayProgress) => void): (() => void) => {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

/** The latest progress of the payment under `key`, if one ran on this page. */
export const payProgressOf = (key: string): PayProgress | undefined => lastProgress.get(key)

const report = (progress: PayProgress) => {
  lastProgress.set(progress.key, progress)
  progressListeners.forEach((listener) => listener(progress))
}

// Attempt records, per identity.
const attemptsKey = (ownId: string) => `paykit.attempts.v1.${ownId}`

export const readAttempts = (ownId: string): Record<string, AttemptRecord> => {
  try {
    const stored = JSON.parse(localStorage.getItem(attemptsKey(ownId)) ?? '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    return {}
  }
}

const writeAttempt = (ownId: string, attemptId: string, record: AttemptRecord) => {
  const all = { ...readAttempts(ownId), [attemptId]: record }
  // Unlike a preference, losing this record could pay twice after a restart: let a failed write stop the
  // payment before any coin moves.
  localStorage.setItem(attemptsKey(ownId), JSON.stringify(all))
}

/** The attempt record of `attemptId`, such as the one a receipt names. */
export const attemptOf = (ownId: string, attemptId: string): AttemptRecord | undefined => readAttempts(ownId)[attemptId]

/** The latest attempt that paid, or may have paid, the request `requestKey` from this device. */
export const attemptForRequest = (ownId: string, requestKey: string): AttemptRecord | undefined =>
  Object.values(readAttempts(ownId))
    .filter((record) => record.requestKey === requestKey && record.status !== 'failed')
    .sort((a, b) => b.startedAtMs - a.startedAtMs)[0]

/** The address and amount a rail payment asks for, or why it cannot be paid by this wallet. */
export const parsePayment = (
  payment: Pick<RailPayment, 'endpointId' | 'payload' | 'amount'>,
): { address: string; sats: number } | { error: string } => {
  if (!paykitConfig.endpoints.some((endpoint) => endpoint.identifier === payment.endpointId)) {
    return { error: 'This wallet cannot pay that kind of address' }
  }
  let address: unknown
  try {
    address = (JSON.parse(payment.payload) as { value?: unknown }).value
  } catch {
    return { error: 'The request has no address to pay' }
  }
  if (typeof address !== 'string' || !/^bcrt1[02-9ac-hj-np-z]{8,87}$/.test(address)) {
    return { error: 'The request has no regtest address to pay' }
  }
  const sats = payment.amount.asset === 'btc' ? btcToSats(payment.amount.value) : undefined
  if (!sats) return { error: 'The request has no amount in bitcoin' }
  return { address, sats }
}

/**
 * A quote from the collaborative exit alone, for `sats` delivered to `address`. Throws the wallet's
 * `InsufficientFundsError` when the settled coins cannot cover it (coins still boarding do not count).
 */
export const quoteExit = async (deps: ExitDeps, address: string, sats: number): Promise<RouteQuote> => {
  const router = createSendRouter({
    wallet: deps.wallet,
    outputFee: deps.outputFee,
    intentFee: deps.intentFee,
    dust: deps.dust,
  })
  const exit = (await router.options({ raw: address, amount: sats })).find(
    (option) => option.railId === WALLET_EXIT_RAIL,
  )
  if (!exit) throw new Error('This address cannot be paid on-chain from this wallet')
  const quote = await exit.quote()
  if (quote.amount !== sats) throw new Error('The on-chain send would not deliver the requested amount')
  return quote
}

const outpoints = async (wallet: IWallet): Promise<Set<string>> =>
  new Set((await wallet.getSpendableVtxos()).map((vtxo) => `${vtxo.txid}:${vtxo.vout}`))

/** What the send screen says about an exit that failed: the error itself goes to the console only. */
const EXIT_FAILED = 'The on-chain payment did not go through. Nothing was sent.'
const EXIT_UNKNOWN = 'The payment may have gone through. Check the request before paying again.'

/**
 * The rail the engine calls for this identity. `deps()` reads the unlocked wallet at the time of the call.
 * `verify` checks a payer's proof on-chain (see `receive.ts`).
 */
export const walletRail = (ownId: string, deps: () => ExitDeps | undefined): PageRail => {
  const answer = (record: AttemptRecord | undefined): RailOutcome | null => {
    if (!record) return null
    if (record.status === 'paid' && record.txid)
      return { status: 'paid', proof: { txid: record.txid }, paidAtMs: record.paidAtMs }
    if (record.status === 'failed') return { status: 'failed' }
    // Paying, or unknown: the coins may have moved, so it is never reported failed.
    return { status: 'pending' }
  }

  const pay = async (payment: RailPayment): Promise<RailOutcome> => {
    const { attemptId } = payment
    const known = attemptOf(ownId, attemptId)
    if (known) return answer(known) ?? { status: 'pending' }

    const parsed = parsePayment(payment)
    const key = 'address' in parsed ? approvalKey(parsed.address, parsed.sats) : `invalid|${attemptId}`
    const fail = (error: string, record?: Omit<AttemptRecord, 'status' | 'error'>): RailOutcome => {
      if (record) writeAttempt(ownId, attemptId, { ...record, status: 'failed', error })
      report({ key, stage: 'failed', attemptId, error })
      return { status: 'failed' }
    }
    if ('error' in parsed) return fail(parsed.error)
    const { address, sats } = parsed
    const approval = approvals.get(key)
    if (!approval || approval.expiresAtMs < Date.now()) return fail('This payment was not approved on this device')
    const base = {
      endpointId: payment.endpointId,
      address,
      sats,
      startedAtMs: Date.now(),
      requestKey: approval.requestKey,
    }
    const exitDeps = deps()
    if (!exitDeps) return fail('Unlock the wallet to pay')

    report({ key, stage: 'preparing', attemptId })
    let quote: RouteQuote
    try {
      quote = await quoteExit(exitDeps, address, sats)
    } catch (error) {
      consoleError(error, 'Paykit could not quote the on-chain payment')
      return fail(paykitErrorText(error, 'prepare'), base)
    }
    if (quote.total > approval.maxTotal) return fail('The network fee went up. Review the payment again.', base)

    // Written before any coin moves: from here on this attempt is never paid again.
    writeAttempt(ownId, attemptId, { ...base, status: 'paying', fee: quote.fee })
    report({ key, stage: 'batch', attemptId })
    const before = await outpoints(exitDeps.wallet).catch(() => undefined)
    try {
      const result = await fundedResult(await quote.send())
      const txid = result?.txid?.toLowerCase()
      if (!txid || !TXID.test(txid)) throw new Error('the exit gave no transaction ID')
      const paidAtMs = Date.now()
      writeAttempt(ownId, attemptId, { ...base, status: 'paid', fee: quote.fee, txid, paidAtMs })
      withdrawApproval(address, sats)
      report({ key, stage: 'paid', attemptId, txid })
      return { status: 'paid', proof: { txid }, paidAtMs }
    } catch (error) {
      consoleError(error, 'Paykit on-chain payment failed')
      // Definitely unpaid only when every coin the wallet could spend before is still unspent.
      const after = await outpoints(exitDeps.wallet).catch(() => undefined)
      const untouched = Boolean(before && after && [...before].every((outpoint) => after.has(outpoint)))
      if (untouched) return fail(EXIT_FAILED, { ...base, fee: quote.fee })
      writeAttempt(ownId, attemptId, { ...base, status: 'unknown', fee: quote.fee, error: EXIT_UNKNOWN })
      report({ key, stage: 'failed', attemptId, error: EXIT_UNKNOWN })
      return { status: 'pending' }
    }
  }

  return {
    pay,
    payment: async (attemptId) => answer(attemptOf(ownId, attemptId)),
    verify: (check) =>
      verifyProof(check, {
        ownId,
        ownAddress: async () => deps()?.wallet.getBoardingAddress(),
      }),
  }
}
