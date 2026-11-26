import { contactDisplayName, readContacts } from '../lib/contacts'
import { paykitConfig } from './config'
import { btcToSats, pubkyContactAddress } from './contacts'
import { prettyLongText } from '../lib/format'
import type { OneTimeRequest, RequestId } from './protocol'
import { parsePayment } from './walletRail'

/** A request's key in lists and in the page's state: payee and request hash. */
export const requestKeyOf = (id: RequestId): string => `${id.payee}/${id.requestHash}`

/** A Pubky ID shortened for a row or a card: `pubky` and the first and last characters. */
export const shortPubky = (pubkyId: string): string => prettyLongText(pubkyContactAddress(pubkyId), 10)

/** The name the wallet's contacts give this Pubky ID, or its short form. */
export const payeeName = (pubkyId: string): string => {
  const contact = readContacts().find((item) => item.address === pubkyContactAddress(pubkyId))
  return contact ? contactDisplayName(contact) : shortPubky(pubkyId)
}

/** What the send screen carries for a Payment Request it pays. */
export interface PaykitSend {
  id: RequestId
  /** The contact's name, as the wallet shows it. */
  name: string
  note: string
  sats: number
  endpointId: string
  address: string
}

/**
 * The on-chain address and amount a request asks this wallet to pay, or why it cannot. Requests to any of
 * the payee's shared details (destination `any`) are not paid from here yet.
 */
export const paymentOf = (request: OneTimeRequest): Omit<PaykitSend, 'name'> | { error: string } => {
  if (request.destination.type !== 'endpoints') return { error: 'This request asks for shared payment details' }
  const sats = request.amount.asset === 'btc' ? btcToSats(request.amount.value) : undefined
  if (!sats) return { error: 'This request is not in bitcoin' }
  for (const endpoint of request.destination.endpoints) {
    if (!paykitConfig.endpoints.some((item) => item.identifier === endpoint.identifier)) continue
    const parsed = parsePayment({ endpointId: endpoint.identifier, payload: endpoint.payload, amount: request.amount })
    if ('address' in parsed) {
      return {
        id: request.id,
        note: request.paymentReference,
        sats,
        endpointId: endpoint.identifier,
        address: parsed.address,
      }
    }
  }
  return { error: 'This wallet cannot pay any address in this request' }
}

/** Whether the payer can still approve or decline the request. */
export const isActionable = (request: OneTimeRequest): boolean =>
  (request.status === 'open' || request.status === 'held') && !request.divergent

/** In words, why the engine refused to pay or decline (`refused` reasons, `pkg/API.md` section 8). */
export const refusalText = (reason: string | undefined, name: string): string => {
  switch (reason) {
    case 'alreadyPaid':
      return 'This request is already paid.'
    case 'paymentInProgress':
      return 'A payment for this request is already on its way.'
    case 'beingHandledByOtherWallet':
      return 'Another of your wallets is paying this request.'
    case 'rejected':
      return 'You declined this request.'
    case 'cancelled':
      return `${name} cancelled this request.`
    case 'deadlinePassed':
      return 'This request has expired.'
    case 'noDestination':
    case 'unsupportedEndpoint':
      return 'This wallet cannot pay the address in this request.'
    case 'identityUnavailable':
      return 'Your Pubky identity is not available right now. Try again in a moment.'
    default:
      return 'This request cannot be paid right now. Try again in a moment.'
  }
}
