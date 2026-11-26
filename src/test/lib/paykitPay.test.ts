import { afterEach, describe, expect, it, vi } from 'vitest'
import { pubkyRecipientOf } from '../../paykit/contacts'
import { isActionable, paymentOf } from '../../paykit/pay'
import type { OneTimeRequest, RailPayment } from '../../paykit/protocol'
import { approvePayment, parsePayment, readAttempts, walletRail } from '../../paykit/walletRail'

const own = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'
const payee = own
const address = 'bcrt1qtc250x2d3wnu5dx08a4qe0yqyqr4x4uvmw2dk3'
const payload = JSON.stringify({ value: address })
const txid = 'a'.repeat(64)

const payment = (attemptId: string, overrides: Partial<RailPayment> = {}): RailPayment => ({
  attemptId,
  endpointId: 'btc-regtest-p2wpkh',
  payload,
  amount: { value: '0.00010000', asset: 'btc' },
  paymentReference: 'Dinner',
  ...overrides,
})

const request = (overrides: Partial<OneTimeRequest> = {}): OneTimeRequest =>
  ({
    id: { payee, requestHash: 'b'.repeat(64) },
    record: 'c'.repeat(64),
    amount: { value: '0.00010000', asset: 'btc' },
    paymentReference: 'Dinner',
    label: null,
    proposalExpiresAtMs: null,
    status: 'open',
    held: false,
    manualOnly: false,
    divergent: false,
    receipt: null,
    destination: { type: 'endpoints', endpoints: [{ identifier: 'btc-regtest-p2wpkh', payload }] },
    ...overrides,
  }) as OneTimeRequest

describe('Paykit paying', () => {
  afterEach(() => localStorage.clear())

  it('reads the address and amount of a regtest payment', () => {
    expect(parsePayment(payment('a1'))).toEqual({ address, sats: 10_000 })
  })

  it('refuses a payment it cannot make', () => {
    expect(parsePayment(payment('a1', { endpointId: 'btc-mainnet-p2wpkh' }))).toHaveProperty('error')
    expect(parsePayment(payment('a1', { payload: '{"value":"bc1qnotregtest"}' }))).toHaveProperty('error')
    expect(parsePayment(payment('a1', { payload: 'not json' }))).toHaveProperty('error')
    expect(parsePayment(payment('a1', { amount: { value: '10', asset: 'usd' } }))).toHaveProperty('error')
  })

  it('finds what a request asks this wallet to pay', () => {
    expect(paymentOf(request())).toMatchObject({ address, sats: 10_000, endpointId: 'btc-regtest-p2wpkh' })
    expect(paymentOf(request({ destination: { type: 'any' } }))).toHaveProperty('error')
    expect(isActionable(request())).toBe(true)
    expect(isActionable(request({ status: 'paid' }))).toBe(false)
  })

  it('reads a Pubky recipient only with its prefix', () => {
    expect(pubkyRecipientOf(`pubky${own}`)).toBe(own)
    expect(pubkyRecipientOf(`pk:${own}`)).toBe(own)
    expect(pubkyRecipientOf(own)).toBeUndefined()
    expect(pubkyRecipientOf(address)).toBeUndefined()
  })

  it('pays nothing the user did not approve', async () => {
    const deps = vi.fn()
    const rail = walletRail(own, deps)
    expect(await rail.pay(payment('a1'))).toEqual({ status: 'failed' })
    expect(deps).not.toHaveBeenCalled()
    // An approval for another amount does not cover it either.
    approvePayment(address, 9_999, 20_000, 'k')
    expect(await rail.pay(payment('a2'))).toEqual({ status: 'failed' })
    expect(deps).not.toHaveBeenCalled()
  })

  it('answers a repeat or a restart from the attempt record, never paying again', async () => {
    localStorage.setItem(
      `paykit.attempts.v1.${own}`,
      JSON.stringify({
        paid: {
          status: 'paid',
          endpointId: 'btc-regtest-p2wpkh',
          address,
          sats: 10_000,
          startedAtMs: 1,
          txid,
          paidAtMs: 2,
        },
        cut: { status: 'paying', endpointId: 'btc-regtest-p2wpkh', address, sats: 10_000, startedAtMs: 1 },
        lost: { status: 'unknown', endpointId: 'btc-regtest-p2wpkh', address, sats: 10_000, startedAtMs: 1 },
      }),
    )
    const deps = vi.fn()
    const rail = walletRail(own, deps)
    approvePayment(address, 10_000, 20_000, 'k')
    expect(await rail.pay(payment('paid'))).toEqual({ status: 'paid', proof: { txid }, paidAtMs: 2 })
    expect(await rail.pay(payment('cut'))).toEqual({ status: 'pending' })
    expect(await rail.payment('lost')).toEqual({ status: 'pending' })
    expect(await rail.payment('never')).toBeNull()
    expect(deps).not.toHaveBeenCalled()
    expect(Object.keys(readAttempts(own))).toHaveLength(3)
  })
})
