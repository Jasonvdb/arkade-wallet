import type { IWallet } from '@arkade-os/sdk'
import { paykitConfig } from './config'
import { btcToSats } from './contacts'
import type { RailProofCheck } from './protocol'

/**
 * Receiving Payment Requests this wallet sent: what it remembers of each request, the boarding coins it has
 * seen, and the check of a payer's proof (the rail's `verify`).
 *
 * Assumptions, for auditing:
 * - A request asks to be paid on-chain to the wallet's boarding address (`btc-regtest-p2tr`, payload
 *   `{"value":"<address>"}`). The payload reaches `verify` as this wallet signed it, so its address is the
 *   wallet's own.
 * - A proof is `{"txid"}`. The check finds that transaction on the local esplora, sums every output to the
 *   address (a payer's collaborative exit is a batch transaction with many outputs) and accepts at or above
 *   the requested amount. Zero confirmations are accepted (demo contract).
 * - The payment time is the earliest of: when this wallet first saw the coin (seen-cache), the block time
 *   when it is confirmed, and now. A transaction that paid the address before the request was made (such as
 *   the wallet's own funding) therefore dates from before the request, and the engine refuses it
 *   (`paymentTimeOutside`). One transaction is credited once: the engine keys settlements by txid.
 * - The seen-cache backs the esplora read: once the wallet boards a coin it leaves the boarding list, so the
 *   cache keeps each boarding coin with its first-seen time, and a proof still verifies from it when esplora
 *   cannot be reached.
 */

const TXID = /^[0-9a-f]{64}$/
const REGTEST_ADDRESS = /^bcrt1[02-9ac-hj-np-z]{8,87}$/

/** Decimal BTC with 8 fraction digits for `sats` (`15000` -> `"0.00015000"`), with no float rounding. */
export const satsToBtc = (sats: number): string => {
  if (!Number.isSafeInteger(sats) || sats < 0) throw new Error('not a whole number of sats')
  const text = String(sats).padStart(9, '0')
  return `${text.slice(0, -8)}.${text.slice(-8)}`
}

const readJson = <T>(key: string): Record<string, T> => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    return {}
  }
}

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the record is a convenience (a note, a first-seen time), not a safety rule.
  }
}

/** What this wallet remembers of a Payment Request it sent, for its lists and its request screen. */
export interface SentRecord {
  /** The payer's Pubky ID. */
  to: string
  requestHash: string
  sats: number
  note: string
  endpointId: string
  address: string
  createdAtMs: number
  /** Where the request message stood when it was sent (`accepted`, `queued`, `waitingForAdmission`, ...). */
  delivery: string
  /** Once the payment is confirmed: its transaction, what it paid the address, and when it was paid. */
  txid?: string
  receivedSats?: number
  paidAtMs?: number
}

const sentKey = (ownId: string) => `paykit.sent.v1.${ownId}`

export const readSent = (ownId: string): Record<string, SentRecord> => readJson<SentRecord>(sentKey(ownId))

export const rememberSent = (ownId: string, record: SentRecord): void =>
  writeJson(sentKey(ownId), { ...readSent(ownId), [record.requestHash]: record })

/** A boarding coin this wallet saw, with the first time it saw it. */
export interface SeenCoin {
  txid: string
  vout: number
  value: number
  address: string
  firstSeenMs: number
}

const seenKey = (ownId: string) => `paykit.seen.v1.${ownId}`

export const readSeen = (ownId: string): Record<string, SeenCoin> => readJson<SeenCoin>(seenKey(ownId))

/** Adds coins to the seen-cache. A coin already there keeps its earlier first-seen time. */
export const recordSeen = (ownId: string, coins: Omit<SeenCoin, 'firstSeenMs'>[], nowMs = Date.now()): void => {
  if (!coins.length) return
  const seen = readSeen(ownId)
  let changed = false
  for (const coin of coins) {
    const key = `${coin.txid}:${coin.vout}`
    if (seen[key]) continue
    seen[key] = { ...coin, firstSeenMs: nowMs }
    changed = true
  }
  if (changed) writeJson(seenKey(ownId), seen)
}

/** Reads the wallet's boarding coins into the seen-cache. Called every few seconds while a request is open. */
export const recordBoardingCoins = async (ownId: string, wallet: IWallet): Promise<void> => {
  const [address, coins] = await Promise.all([wallet.getBoardingAddress(), wallet.getBoardingUtxos()])
  recordSeen(
    ownId,
    coins.map((coin) => ({ txid: coin.txid, vout: coin.vout, value: coin.value, address })),
  )
}

/** What the last check of a proof found, per attempt ID: for the request screen's words. */
export type ProofCheckResult =
  | { kind: 'verified'; txid: string; sats: number; receivedSats: number; paidAtMs: number }
  | { kind: 'short'; txid: string; sats: number; receivedSats: number }
  | { kind: 'notFound'; txid: string; sats: number }
  | { kind: 'invalid'; reason: string }

const lastChecks = new Map<string, ProofCheckResult>()

/** The last check of the proof of `attemptId` on this page, if one ran. */
export const lastCheckOf = (attemptId: string | null | undefined): ProofCheckResult | undefined =>
  attemptId ? lastChecks.get(attemptId) : undefined

/** One transaction as esplora gives it: its outputs, and its block time once confirmed. */
export interface ChainTx {
  outputs: { address?: string; value: number }[]
  blockTimeMs?: number
}

/** The transaction `txid` from esplora; `null` when esplora does not know it. Throws when esplora fails. */
export const fetchChainTx = async (
  esplora: string,
  txid: string,
  fetchFn: typeof fetch = fetch,
): Promise<ChainTx | null> => {
  const answer = await fetchFn(`${esplora}/tx/${txid}`)
  if (answer.status === 404 || answer.status === 400) return null
  if (!answer.ok) throw new Error(`esplora answered ${answer.status}`)
  const tx = (await answer.json()) as {
    vout?: { scriptpubkey_address?: string; value?: number }[]
    status?: { confirmed?: boolean; block_time?: number }
  }
  return {
    outputs: (tx.vout ?? []).map((out) => ({ address: out.scriptpubkey_address, value: Number(out.value ?? 0) })),
    blockTimeMs: tx.status?.confirmed && tx.status.block_time ? tx.status.block_time * 1000 : undefined,
  }
}

export interface VerifyDeps {
  ownId: string
  /** The wallet's boarding address, for a proof whose request named no address (destination `any`). */
  ownAddress: () => Promise<string | undefined>
  esplora?: string
  fetchFn?: typeof fetch
  now?: () => number
}

/**
 * The rail's `verify`: the payment time of a proof that pays at least the amount to the address, or `null`.
 * Throws when it cannot check now (esplora unreachable and nothing in the seen-cache): the engine keeps the
 * proof and the wallet checks again.
 */
export const verifyProof = async (check: RailProofCheck, deps: VerifyDeps): Promise<number | null> => {
  const now = deps.now ?? Date.now
  const invalid = (reason: string) => {
    lastChecks.set(check.attemptId, { kind: 'invalid', reason })
    return null
  }
  const rawTxid = typeof check.proof.txid === 'string' ? check.proof.txid : ''
  if (!TXID.test(rawTxid)) return invalid('The payment proof names no transaction')
  const txid = rawTxid
  if (!paykitConfig.endpoints.some((endpoint) => endpoint.identifier === check.endpointId)) {
    return invalid('The payment used an address type this wallet does not receive on')
  }
  const sats = check.amount.asset === 'btc' ? btcToSats(check.amount.value) : undefined
  if (!sats) return invalid('The request has no amount in bitcoin')

  let address: unknown
  if (check.payload === null) address = await deps.ownAddress()
  else {
    try {
      address = (JSON.parse(check.payload) as { value?: unknown }).value
    } catch {
      address = undefined
    }
  }
  if (typeof address !== 'string' || !REGTEST_ADDRESS.test(address)) {
    return invalid('The request names no regtest address')
  }

  // The chain first; the seen-cache when esplora cannot answer.
  let chain: ChainTx | null | undefined
  let chainError: unknown
  try {
    chain = await fetchChainTx(deps.esplora ?? paykitConfig.esploraUrl, txid, deps.fetchFn)
  } catch (error) {
    chainError = error
  }
  const cached = Object.values(readSeen(deps.ownId)).filter((coin) => coin.txid === txid && coin.address === address)

  let receivedSats: number
  if (chain) {
    const outputs = chain.outputs.map((out, vout) => ({ ...out, vout })).filter((out) => out.address === address)
    receivedSats = outputs.reduce((sum, out) => sum + out.value, 0)
    // Keep what the chain showed, so a later check dates it the same and works without esplora.
    recordSeen(
      deps.ownId,
      outputs.map((out) => ({ txid, vout: out.vout, value: out.value, address })),
      Math.min(now(), chain.blockTimeMs ?? Infinity),
    )
  } else if (cached.length) {
    receivedSats = cached.reduce((sum, coin) => sum + coin.value, 0)
  } else if (chain === null) {
    lastChecks.set(check.attemptId, { kind: 'notFound', txid, sats })
    return null
  } else {
    throw chainError instanceof Error ? chainError : new Error('esplora could not be reached')
  }

  if (receivedSats < sats) {
    lastChecks.set(check.attemptId, { kind: 'short', txid, sats, receivedSats })
    return null
  }
  const firstSeen = Object.values(readSeen(deps.ownId))
    .filter((coin) => coin.txid === txid && coin.address === address)
    .map((coin) => coin.firstSeenMs)
  const paidAtMs = Math.min(now(), chain?.blockTimeMs ?? Infinity, ...firstSeen)
  lastChecks.set(check.attemptId, { kind: 'verified', txid, sats, receivedSats, paidAtMs })
  return paidAtMs
}
