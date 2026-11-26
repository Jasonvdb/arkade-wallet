import { BOARDING_ENDPOINT, SEGWIT_ENDPOINT, paykitConfig } from './config'
import type { ListEndpoint, ReceivedList } from './protocol'

/**
 * Private payment details: the Private Payment List this wallet shares with its connected contacts, and the
 * ones they share back.
 *
 * Assumptions, for auditing:
 * - The wallet shares one endpoint, its boarding address as `btc-regtest-p2tr` (payload `{"value":"<address>"}`,
 *   CONTRACT.md "Payment method"). A request with destination `any` is paid to it, and the rail's `verify`
 *   then gets no payload and checks the boarding address (see `receive.ts`).
 * - A contact's list is only ever read from the engine, which accepts a list only from a contact both sides
 *   admit and drops it once it expires or is withdrawn. The wallet pays only an endpoint it supports, and only
 *   after the user approved that address and amount on the send screen.
 */

/** The list this wallet shares: its boarding address. */
export const listEndpointsFor = (address: string): ListEndpoint[] => [
  { identifier: BOARDING_ENDPOINT, payload: JSON.stringify({ value: address }) },
]

/** The address in an on-chain endpoint's payload, or `undefined`. */
export const addressOfPayload = (payload: string): string | undefined => {
  try {
    const value = (JSON.parse(payload) as { value?: unknown }).value
    return typeof value === 'string' && value ? value : undefined
  } catch {
    return undefined
  }
}

/** Whether two lists name the same endpoints (same identifiers and addresses, in any order). */
export const sameListEndpoints = (current: ListEndpoint[] | null, wanted: ListEndpoint[]): boolean => {
  if (!current || current.length !== wanted.length) return false
  const key = (endpoint: ListEndpoint) => `${endpoint.identifier}|${addressOfPayload(endpoint.payload) ?? ''}`
  const have = new Set(current.map(key))
  return wanted.every((endpoint) => have.has(key(endpoint)))
}

/** What a payment method is, in words for the user. */
export const methodName = (identifier: string): string => {
  switch (identifier) {
    case BOARDING_ENDPOINT:
      return 'Bitcoin address (Taproot)'
    case SEGWIT_ENDPOINT:
      return 'Bitcoin address (SegWit)'
    default:
      return 'Payment method'
  }
}

/** One endpoint of a contact's list that this wallet can pay. */
export interface PrivateEndpoint {
  endpointId: string
  address: string
  /** The contact's app that shared it: `payRequest`'s `listApp`. */
  listApp: string
  /** When this wallet received the list. */
  acceptedAtMs: number | null
}

const REGTEST_ADDRESS = /^bcrt1[02-9ac-hj-np-z]{8,87}$/

/**
 * The endpoint this wallet would pay from the details `contact` shared, from the newest usable list: the first
 * endpoint of a kind this wallet pays. `undefined` when the contact shared none (or withdrew it).
 */
export const privateEndpointOf = (lists: ReceivedList[], contact: string): PrivateEndpoint | undefined => {
  const usable = lists
    .filter((list) => list.payee === contact && list.usable && list.endpoints.length)
    .sort((a, b) => (b.acceptedAtMs ?? 0) - (a.acceptedAtMs ?? 0))
  for (const list of usable) {
    for (const endpoint of list.endpoints) {
      if (!paykitConfig.endpoints.some((item) => item.identifier === endpoint.identifier)) continue
      const address = addressOfPayload(endpoint.payload)
      if (address && REGTEST_ADDRESS.test(address)) {
        return { endpointId: endpoint.identifier, address, listApp: list.appId, acceptedAtMs: list.acceptedAtMs }
      }
    }
  }
  return undefined
}
