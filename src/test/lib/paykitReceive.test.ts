import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RailProofCheck } from '../../paykit/protocol'
import {
  lastCheckOf,
  readSeen,
  recordBoardingCoins,
  recordSeen,
  satsToBtc,
  verifyProof,
  type VerifyDeps,
} from '../../paykit/receive'

const own = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'
const boarding = 'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv'
const other = 'bcrt1qtc250x2d3wnu5dx08a4qe0yqyqr4x4uvmw2dk3'
const txid = 'd'.repeat(64)
const NOW = 1_800_000_000_000

const check = (overrides: Partial<RailProofCheck> = {}): RailProofCheck => ({
  endpointId: 'btc-regtest-p2tr',
  payload: JSON.stringify({ value: boarding }),
  amount: { value: '0.00015000', asset: 'btc' },
  attemptId: `attempt-${Math.random()}`,
  proof: { txid },
  ...overrides,
})

/** An esplora that knows one transaction with these outputs. */
const esplora =
  (
    outputs: { address: string; value: number }[],
    status: { confirmed: boolean; block_time?: number } = { confirmed: false },
  ) =>
  async (url: RequestInfo | URL) => {
    if (!String(url).endsWith(`/tx/${txid}`)) return new Response('not found', { status: 404 })
    return Response.json({
      txid,
      vout: outputs.map((out) => ({ scriptpubkey_address: out.address, value: out.value })),
      status,
    })
  }

const deps = (fetchFn: typeof fetch, overrides: Partial<VerifyDeps> = {}): VerifyDeps => ({
  ownId: own,
  ownAddress: async () => boarding,
  esplora: 'http://esplora.test/api',
  fetchFn,
  now: () => NOW,
  ...overrides,
})

describe('Paykit receiving', () => {
  afterEach(() => localStorage.clear())

  it('writes sats as decimal BTC with 8 fraction digits', () => {
    expect(satsToBtc(15_000)).toBe('0.00015000')
    expect(satsToBtc(1)).toBe('0.00000001')
    expect(satsToBtc(123_456_789)).toBe('1.23456789')
    expect(() => satsToBtc(1.5)).toThrow()
  })

  it('verifies a transaction that pays the address at least the amount, summing every output', async () => {
    const input = check()
    const fetchFn = esplora([
      { address: other, value: 50_000 },
      { address: boarding, value: 10_000 },
      { address: boarding, value: 5_000 },
    ]) as typeof fetch
    expect(await verifyProof(input, deps(fetchFn))).toBe(NOW)
    expect(lastCheckOf(input.attemptId)).toMatchObject({ kind: 'verified', receivedSats: 15_000 })
    // Its coins are remembered with their first-seen time.
    expect(Object.values(readSeen(own)).map((coin) => coin.vout)).toEqual([1, 2])
  })

  it('does not verify a transaction that pays too little', async () => {
    const input = check()
    const fetchFn = esplora([{ address: boarding, value: 14_000 }]) as typeof fetch
    expect(await verifyProof(input, deps(fetchFn))).toBeNull()
    expect(lastCheckOf(input.attemptId)).toMatchObject({ kind: 'short', receivedSats: 14_000, sats: 15_000 })
  })

  it('does not count outputs to another address', async () => {
    const input = check()
    const fetchFn = esplora([{ address: other, value: 20_000 }]) as typeof fetch
    expect(await verifyProof(input, deps(fetchFn))).toBeNull()
    expect(lastCheckOf(input.attemptId)).toMatchObject({ kind: 'short', receivedSats: 0 })
  })

  it('answers null while the transaction is not found', async () => {
    const input = check({ proof: { txid: 'e'.repeat(64) } })
    const fetchFn = esplora([{ address: boarding, value: 15_000 }]) as typeof fetch
    expect(await verifyProof(input, deps(fetchFn))).toBeNull()
    expect(lastCheckOf(input.attemptId)).toMatchObject({ kind: 'notFound' })
  })

  it('refuses a proof without a txid, or for an identifier it does not receive on', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const noTxid = check({ proof: { txid: 'XYZ' } })
    expect(await verifyProof(noTxid, deps(fetchFn))).toBeNull()
    expect(lastCheckOf(noTxid.attemptId)).toMatchObject({ kind: 'invalid' })
    expect(await verifyProof(check({ endpointId: 'btc-mainnet' }), deps(fetchFn))).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('dates the payment by its block time or first sighting when those are earlier', async () => {
    const confirmed = esplora([{ address: boarding, value: 15_000 }], {
      confirmed: true,
      block_time: (NOW - 600_000) / 1000,
    }) as typeof fetch
    expect(await verifyProof(check(), deps(confirmed))).toBe(NOW - 600_000)

    localStorage.clear()
    recordSeen(own, [{ txid, vout: 0, value: 15_000, address: boarding }], NOW - 90_000)
    const mempool = esplora([{ address: boarding, value: 15_000 }]) as typeof fetch
    expect(await verifyProof(check(), deps(mempool))).toBe(NOW - 90_000)
  })

  it('verifies from the seen-cache when esplora cannot be reached', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    // Nothing known: it cannot check now, so the engine keeps the proof.
    await expect(verifyProof(check(), deps(down))).rejects.toThrow('Failed to fetch')

    // A coin seen on the boarding list before it was boarded still verifies.
    recordSeen(own, [{ txid, vout: 1, value: 15_000, address: boarding }], NOW - 30_000)
    expect(await verifyProof(check(), deps(down))).toBe(NOW - 30_000)
  })

  it('checks a request without an address against the wallet’s own boarding address', async () => {
    const fetchFn = esplora([{ address: boarding, value: 15_000 }]) as typeof fetch
    expect(await verifyProof(check({ payload: null }), deps(fetchFn))).toBe(NOW)
    expect(await verifyProof(check({ payload: null }), deps(fetchFn, { ownAddress: async () => other }))).toBeNull()
  })

  it('keeps the first sighting of each boarding coin', async () => {
    const wallet = {
      getBoardingAddress: async () => boarding,
      getBoardingUtxos: async () => [{ txid, vout: 0, value: 15_000 }],
    }
    vi.useFakeTimers({ now: NOW - 5_000 })
    try {
      await recordBoardingCoins(own, wallet as never)
      vi.setSystemTime(NOW)
      await recordBoardingCoins(own, wallet as never)
    } finally {
      vi.useRealTimers()
    }
    expect(readSeen(own)[`${txid}:0`]).toMatchObject({ address: boarding, value: 15_000, firstSeenMs: NOW - 5_000 })
  })
})
