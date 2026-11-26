import { describe, expect, it } from 'vitest'
import {
  addressOfPayload,
  listEndpointsFor,
  methodName,
  privateEndpointOf,
  sameListEndpoints,
} from '../../paykit/lists'
import { paymentOf } from '../../paykit/pay'
import type { OneTimeRequest, ReceivedList } from '../../paykit/protocol'

const payee = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'
const other = 'yebzppz47hqgwmc9f8j1sqbmk8mzmsomzkd4n1zk7ypgfoew3n3y'
const boarding = 'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv'
const segwit = 'bcrt1qtc250x2d3wnu5dx08a4qe0yqyqr4x4uvmw2dk3'
const older = 'bcrt1qgdfcu05ldp4krg346wx9xslwj0m0fg6uldzpx7'

const list = (overrides: Partial<ReceivedList> = {}): ReceivedList => ({
  payee,
  appId: 'AAAAAAAAAAAAAAAAAAAAAA',
  version: { generation: 1, counter: 1 },
  endpoints: [{ identifier: 'btc-regtest-p2wpkh', payload: JSON.stringify({ value: segwit }) }],
  acceptedAtMs: 2_000,
  usableUntilMs: 9_000_000_000_000,
  usable: true,
  ...overrides,
})

const anyRequest = (): OneTimeRequest =>
  ({
    id: { payee, requestHash: 'b'.repeat(64) },
    record: 'c'.repeat(64),
    amount: { value: '0.00009000', asset: 'btc' },
    paymentReference: 'Coffee beans',
    label: null,
    proposalExpiresAtMs: null,
    status: 'open',
    held: false,
    manualOnly: false,
    divergent: false,
    receipt: null,
    destination: { type: 'any' },
  }) as OneTimeRequest

describe('Paykit private payment details', () => {
  it('shares the boarding address as a Taproot endpoint', () => {
    expect(listEndpointsFor(boarding)).toEqual([
      { identifier: 'btc-regtest-p2tr', payload: JSON.stringify({ value: boarding }) },
    ])
    expect(addressOfPayload('{"value":"x"}')).toBe('x')
    expect(addressOfPayload('not json')).toBeUndefined()
  })

  it('sets the list again only when its endpoints change', () => {
    const wanted = listEndpointsFor(boarding)
    expect(sameListEndpoints(null, wanted)).toBe(false)
    expect(sameListEndpoints([{ identifier: 'btc-regtest-p2tr', payload: `{ "value": "${boarding}" }` }], wanted)).toBe(
      true,
    )
    expect(sameListEndpoints(listEndpointsFor(segwit), wanted)).toBe(false)
    expect(sameListEndpoints([...wanted, ...listEndpointsFor(segwit)], wanted)).toBe(false)
  })

  it('names payment methods in words', () => {
    expect(methodName('btc-regtest-p2wpkh')).toBe('Bitcoin address (SegWit)')
    expect(methodName('btc-regtest-p2tr')).toBe('Bitcoin address (Taproot)')
  })

  it('picks the newest usable list of that contact, with an endpoint this wallet pays', () => {
    const lists = [
      list({ acceptedAtMs: 1_000, appId: 'BBBBBBBBBBBBBBBBBBBBBB', endpoints: listEndpointsFor(older) }),
      list(),
      list({ payee: other, acceptedAtMs: 5_000 }),
      list({ acceptedAtMs: 6_000, usable: false }),
      list({ acceptedAtMs: 7_000, endpoints: [] }),
      list({ acceptedAtMs: 8_000, endpoints: [{ identifier: 'ln-bolt12', payload: '{"value":"lno1"}' }] }),
    ]
    expect(privateEndpointOf(lists, payee)).toEqual({
      endpointId: 'btc-regtest-p2wpkh',
      address: segwit,
      listApp: 'AAAAAAAAAAAAAAAAAAAAAA',
      acceptedAtMs: 2_000,
    })
    expect(privateEndpointOf([], payee)).toBeUndefined()
  })

  it('pays a request to private details at the address the payee shared', () => {
    expect(paymentOf(anyRequest(), [list()])).toMatchObject({
      address: segwit,
      sats: 9_000,
      endpointId: 'btc-regtest-p2wpkh',
      listApp: 'AAAAAAAAAAAAAAAAAAAAAA',
    })
    expect(paymentOf(anyRequest(), [list({ payee: other })])).toMatchObject({ waitingForDetails: true })
  })
})
