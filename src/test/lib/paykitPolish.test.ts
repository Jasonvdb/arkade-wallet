import { afterEach, describe, expect, it } from 'vitest'
import { InsufficientFundsError } from '../../lib/asp'
import { saveContact } from '../../lib/contacts'
import type { Tx } from '../../lib/types'
import { paykitPaymentOf, paykitPaymentsByTxid } from '../../paykit/activity'
import { pubkyContactAddress } from '../../paykit/contacts'
import { paykitErrorText } from '../../paykit/errors'
import { PaykitCallError, type OneTimeRequest } from '../../paykit/protocol'
import { rememberSent } from '../../paykit/receive'
import { readRequestsSeen, rememberRequestsSeen } from '../../paykit/requestsSeen'

const own = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'
const contact = '9mx33sewushyapdmiypsgn1zkt7ukzhiyrosy49jia9spo6qqrpy'
const paidTxid = 'a'.repeat(64)
const receivedTxid = 'b'.repeat(64)
const requestHash = 'c'.repeat(64)

const request = (overrides: Partial<OneTimeRequest> = {}): OneTimeRequest =>
  ({
    id: { payee: contact, requestHash },
    record: 'd'.repeat(64),
    amount: { value: '0.00020000', asset: 'btc' },
    paymentReference: 'Pizza night',
    label: null,
    proposalExpiresAtMs: null,
    status: 'paid',
    held: false,
    manualOnly: false,
    divergent: false,
    receipt: null,
    destination: { type: 'any' },
    ...overrides,
  }) as OneTimeRequest

const tx = (overrides: Partial<Tx>): Tx =>
  ({
    amount: 20_000,
    boardingTxid: '',
    createdAt: 1_700_000_000,
    explorable: undefined,
    preconfirmed: false,
    redeemTxid: '',
    roundTxid: '',
    settled: true,
    type: 'sent',
    ...overrides,
  }) as Tx

describe('Paykit error copy', () => {
  it('test_paykit_error_text_maps_engine_codes_to_wallet_copy', () => {
    const offline = new PaykitCallError('homeserver: the homeserver answered 502 for /pub/x', 'homeserver')
    expect(paykitErrorText(offline, 'pay')).toBe(
      'The wallet could not reach Pubky. Check your connection and try again.',
    )
    // A code read from the message alone (`<code>: <text>`) maps the same way.
    expect(paykitErrorText(new PaykitCallError('store: the lock is held'), 'pay')).toMatch(/open in another tab/)
  })

  it('test_paykit_error_text_never_echoes_the_error_message', () => {
    const raw = new Error('Settlement failed: ProviderUnavailableError: arkade request failed')
    for (const step of ['pay', 'prepare'] as const) {
      const text = paykitErrorText(raw, step)
      expect(text).not.toMatch(/Settlement|ProviderUnavailable|arkade request/)
      expect(text.length).toBeGreaterThan(0)
    }
    expect(paykitErrorText(new PaykitCallError('rail: exit failed: boom', 'rail'), 'pay')).not.toMatch(/boom/)
    expect(paykitErrorText(new InsufficientFundsError(), 'prepare')).toMatch(/enough bitcoin/)
  })
})

describe('Paykit request dates', () => {
  afterEach(() => localStorage.clear())

  it('test_requests_seen_keeps_the_first_time', () => {
    rememberRequestsSeen(own, ['a/1'], 1_000)
    rememberRequestsSeen(own, ['a/1', 'a/2'], 2_000)
    expect(readRequestsSeen(own)).toEqual({ 'a/1': 1_000, 'a/2': 2_000 })
  })

  it('test_requests_seen_survives_unreadable_storage', () => {
    localStorage.setItem(`paykit.requests-seen.v1.${own}`, 'not json')
    expect(readRequestsSeen(own)).toEqual({})
  })
})

describe('Paykit payments on Activity', () => {
  afterEach(() => localStorage.clear())

  it('test_activity_names_paid_and_received_payments', () => {
    saveContact(pubkyContactAddress(contact), 'Bitkit')
    localStorage.setItem(
      `paykit.attempts.v1.${own}`,
      JSON.stringify({
        attempt1: {
          status: 'paid',
          endpointId: 'btc-regtest-p2wpkh',
          address: 'bcrt1qtc250x2d3wnu5dx08a4qe0yqyqr4x4uvmw2dk3',
          sats: 20_000,
          startedAtMs: 1,
          requestKey: `${contact}/${requestHash}`,
          txid: paidTxid,
        },
        attempt2: { status: 'failed', endpointId: 'x', address: 'y', sats: 1, startedAtMs: 2, requestKey: 'p/q' },
      }),
    )
    rememberSent(own, {
      to: contact,
      requestHash: 'e'.repeat(64),
      sats: 15_000,
      note: 'Concert tickets',
      endpointId: 'btc-regtest-p2tr',
      address: 'bcrt1p...',
      createdAtMs: 3,
      delivery: 'accepted',
      txid: receivedTxid,
    })
    const payments = paykitPaymentsByTxid(own, [request()])
    expect(payments.size).toBe(2)

    // A collaborative exit is the batch (commitment) transaction; a payment received is a boarding receive.
    expect(paykitPaymentOf(payments, tx({ roundTxid: paidTxid }))).toEqual({ name: 'Bitkit', note: 'Pizza night' })
    expect(paykitPaymentOf(payments, tx({ type: 'received', boardingTxid: receivedTxid }))).toEqual({
      name: 'Bitkit',
      note: 'Concert tickets',
    })
    expect(paykitPaymentOf(payments, tx({ roundTxid: 'f'.repeat(64) }))).toBeUndefined()
  })

  it('test_activity_keeps_a_paid_row_without_its_request', () => {
    localStorage.setItem(
      `paykit.attempts.v1.${own}`,
      JSON.stringify({
        attempt1: {
          status: 'paid',
          endpointId: 'btc-regtest-p2wpkh',
          address: 'bcrt1q...',
          sats: 20_000,
          startedAtMs: 1,
          requestKey: `${contact}/${requestHash}`,
          txid: paidTxid,
        },
      }),
    )
    // The requests are not read yet: the row still names the contact (by its short Pubky ID), with no note.
    const payment = paykitPaymentOf(paykitPaymentsByTxid(own, []), tx({ roundTxid: paidTxid }))
    expect(payment?.note).toBe('')
    expect(payment?.name).toMatch(/^pubky/)
  })
})
