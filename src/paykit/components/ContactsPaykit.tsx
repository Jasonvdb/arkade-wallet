import { useContext } from 'react'
import ArrowIcon from '../../icons/Arrow'
import { ConfigContext } from '../../providers/config'
import { NavigationContext, Pages } from '../../providers/navigation'
import ShieldIcon from '../../icons/ShieldCheckOutline'
import ReceivedIcon from '../../icons/Received'
import SentIcon from '../../icons/Sent'
import { prettyBitcoinAmount, prettyDate, prettyLongText } from '../../lib/format'
import { contactDisplayName, readContacts, type Contact } from '../../lib/contacts'
import { btcToSats, pubkyContactAddress, type Connection } from '../contacts'
import { methodName, privateEndpointOf } from '../lists'
import { requestKeyOf, shortPubky } from '../pay'
import { PaykitContext } from '../provider'
import type { OneTimeRequest, PayeeRequest } from '../protocol'
import { readSent, type SentRecord } from '../receive'
import { readRequestsSeen } from '../requestsSeen'
import type { ProofCheck } from '../sync'
import './Paykit.css'

export { shortPubky }

const initialFor = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

const seconds = (ms: number) => Math.floor(ms / 1000)

/**
 * The left of a request row. On the contacts list: the contact's initial, the contact's name and the note.
 * On a contact's page, where the section names the contact: which way the money goes (as on Activity), the
 * note, and when.
 */
function RequestRowLead({
  name,
  note,
  atMs,
  direction,
  fromContactPage,
}: {
  name: string
  note: string
  atMs?: number
  direction: 'out' | 'in'
  fromContactPage: boolean
}) {
  if (!fromContactPage) {
    return (
      <span className='settings-row__main'>
        <span className='contact-avatar contact-avatar--row' aria-hidden='true'>
          {initialFor(name)}
        </span>
        <span className='contact-list-item-copy'>
          <strong>{name}</strong>
          <small>{note}</small>
        </span>
      </span>
    )
  }
  return (
    <span className='settings-row__main'>
      <span className='activity-row__icon' aria-hidden='true'>
        {direction === 'out' ? <SentIcon /> : <ReceivedIcon />}
      </span>
      <span className='contact-list-item-copy'>
        <strong>{note}</strong>
        {atMs ? <small>{prettyDate(seconds(atMs))}</small> : null}
      </span>
    </span>
  )
}

/** Where a request stands for the payer, in words. Unknown statuses read as pending. */
const REQUEST_STATUS: Record<string, { text: string; tone: string }> = {
  open: { text: 'Requested', tone: 'open' },
  held: { text: 'Requested', tone: 'open' },
  beingPaidHere: { text: 'Paying', tone: 'pending' },
  beingHandledByOtherWallet: { text: 'Paying elsewhere', tone: 'pending' },
  mayBePaid: { text: 'Checking payment', tone: 'pending' },
  paid: { text: 'Paid', tone: 'paid' },
  rejected: { text: 'Declined', tone: 'rejected' },
  cancelled: { text: 'Cancelled', tone: 'cancelled' },
  expired: { text: 'Expired', tone: 'expired' },
}
/** A request's status in words; a paid request waits for the contact's receipt. */
export const requestStatus = (status: string, receipt: boolean): { text: string; tone: string } => {
  if (status === 'paid' && !receipt) return { text: 'Waiting for receipt', tone: 'pending' }
  return REQUEST_STATUS[status] ?? { text: 'Pending', tone: 'pending' }
}

/**
 * Where a request this wallet sent stands, in words: waiting for the payment, checking it on-chain, received
 * (receipt sent), or not confirmed because it pays too little.
 */
export const sentStatus = (status: string, check: ProofCheck | undefined): { text: string; tone: string } => {
  switch (status) {
    case 'requested':
    case 'accepted':
      return { text: 'Waiting for payment', tone: 'open' }
    case 'proofReceived':
      if (check?.state === 'short') return { text: 'Paid too little', tone: 'warning' }
      if (check?.state === 'refused') return { text: 'Not confirmed', tone: 'warning' }
      if (check?.state === 'confirmed') return { text: 'Received', tone: 'paid' }
      return { text: 'Checking payment', tone: 'pending' }
    case 'receipted':
      return { text: 'Received', tone: 'paid' }
    case 'rejected':
      return { text: 'Declined', tone: 'rejected' }
    case 'cancelled':
      return { text: 'Cancelled', tone: 'cancelled' }
    default:
      return { text: 'Pending', tone: 'pending' }
  }
}

/** Whether a Pubky contact has added this wallet back: a dot and words, or a pill on the contact's card. */
export function ConnectionStatus({
  connection,
  name,
  pill,
  testId,
  pubkyId,
}: {
  connection: Connection
  name: string
  pill?: boolean
  testId?: string
  pubkyId?: string
}) {
  const text = connection === 'connected' ? 'Connected' : `Waiting for ${name} to add you`
  return (
    <span
      className={`paykit-connection paykit-connection--${connection}${pill ? ' paykit-connection--pill' : ''}`}
      data-testid={testId}
      data-connection={connection}
      data-pubky={pubkyId}
    >
      <span className='paykit-connection__dot' aria-hidden='true' />
      <span className='paykit-connection__text'>{text}</span>
    </span>
  )
}

/** The contact that sent a request, by its Pubky ID, from the wallet's saved contacts. */
const contactFor = (contacts: Contact[], pubkyId: string) =>
  contacts.find((contact) => contact.address === pubkyContactAddress(pubkyId))

function RequestRow({
  request,
  contacts,
  fromContactPage,
}: {
  request: OneTimeRequest
  contacts: Contact[]
  fromContactPage: boolean
}) {
  const { config } = useContext(ConfigContext)
  const { navigate } = useContext(NavigationContext)
  const { focusRequest, setReturnContact, identity } = useContext(PaykitContext)
  const contact = contactFor(contacts, request.id.payee)
  const name = contact ? contactDisplayName(contact) : shortPubky(request.id.payee)
  const sats = request.amount.asset === 'btc' ? btcToSats(request.amount.value) : undefined
  const amount =
    sats !== undefined ? prettyBitcoinAmount(sats, config.unit) : `${request.amount.value} ${request.amount.asset}`
  const status = requestStatus(request.status, Boolean(request.receipt))
  const open = () => {
    focusRequest(request.id)
    setReturnContact(fromContactPage ? contact?.address : undefined)
    navigate(Pages.PaykitRequest)
  }
  return (
    <button
      type='button'
      className='settings-row contact-list-item paykit-request'
      aria-label={`Payment request from ${name}`}
      onClick={open}
      data-testid='paykit-incoming-row'
      data-request-hash={request.id.requestHash}
      data-payee={request.id.payee}
      data-status={request.status}
      data-amount={request.amount.value}
      data-sats={sats}
      data-note={request.paymentReference}
      data-receipt={request.receipt ? 'received' : 'none'}
    >
      <RequestRowLead
        name={name}
        note={request.paymentReference}
        atMs={identity ? readRequestsSeen(identity)[requestKeyOf(request.id)] : undefined}
        direction='out'
        fromContactPage={fromContactPage}
      />
      <span className='paykit-request__amount'>
        <strong>{amount}</strong>
        <span className={`paykit-request__status paykit-request__status--${status.tone}`}>{status.text}</span>
      </span>
      <span className='settings-row__chevron' aria-hidden='true'>
        <ArrowIcon />
      </span>
    </button>
  )
}

/**
 * The Payment Requests contacts sent this wallet, newest first: who asks, the note, the amount and where it
 * stands. With `payee`, only that contact's. Shown once Paykit runs; nothing at all when there is none and
 * `emptyText` is not given.
 */
export function IncomingRequests({
  payee,
  emptyText,
  label = 'Requests from contacts',
}: {
  payee?: string
  emptyText?: string
  label?: string
}) {
  const { status, data } = useContext(PaykitContext)
  if (status !== 'ready' && status !== 'restarting') return null
  const requests = data.requests.filter((request) => !payee || request.id.payee === payee)
  if (!requests.length && !emptyText) return null
  const contacts = readContacts()
  return (
    <section className='settings-section paykit-requests' data-testid='paykit-incoming'>
      <p className='settings-section-label'>{label}</p>
      {requests.length ? (
        <div className='contact-list settings-row-group'>
          {requests.map((request) => (
            <RequestRow
              key={requestKeyOf(request.id)}
              request={request}
              contacts={contacts}
              fromContactPage={Boolean(payee)}
            />
          ))}
        </div>
      ) : (
        <p className='contact-history-empty' data-testid='paykit-incoming-empty'>
          {data.requestsLoaded ? emptyText : 'Loading payment requests…'}
        </p>
      )}
    </section>
  )
}

/** A sent request's activity record with what this wallet remembers of it, for lists. */
interface SentItem {
  activity: PayeeRequest
  sent?: SentRecord
}

function SentRow({
  item,
  contacts,
  fromContactPage,
}: {
  item: SentItem
  contacts: Contact[]
  fromContactPage: boolean
}) {
  const { config } = useContext(ConfigContext)
  const { navigate } = useContext(NavigationContext)
  const { focusSent, setReturnContact, data } = useContext(PaykitContext)
  const { activity, sent } = item
  const contact = contactFor(contacts, activity.payer)
  const name = contact ? contactDisplayName(contact) : shortPubky(activity.payer)
  const sats = activity.amount?.asset === 'btc' ? btcToSats(activity.amount.value) : sent?.sats
  const amount = sats !== undefined ? prettyBitcoinAmount(sats, config.unit) : (activity.amount?.value ?? '')
  const check = data.checks[activity.record]
  const status = sentStatus(activity.status, check)
  const open = () => {
    focusSent(activity.requestHash ?? undefined)
    setReturnContact(fromContactPage ? contact?.address : undefined)
    navigate(Pages.PaykitSentRequest)
  }
  return (
    <button
      type='button'
      className='settings-row contact-list-item paykit-request'
      aria-label={`Payment request to ${name}`}
      onClick={open}
      data-testid='paykit-activity-row'
      data-request-hash={activity.requestHash ?? undefined}
      data-payer={activity.payer}
      data-status={activity.status}
      data-check={check?.state ?? 'none'}
      data-sats={sats}
    >
      <RequestRowLead
        name={name}
        note={sent?.note ?? 'Payment request'}
        atMs={sent?.createdAtMs}
        direction='in'
        fromContactPage={fromContactPage}
      />
      <span className='paykit-request__amount'>
        <strong>{amount}</strong>
        <span className={`paykit-request__status paykit-request__status--${status.tone}`}>{status.text}</span>
      </span>
      <span className='settings-row__chevron' aria-hidden='true'>
        <ArrowIcon />
      </span>
    </button>
  )
}

/**
 * The Payment Requests this wallet sent to contacts, newest first: who pays, the note, the amount and where
 * it stands. With `payer`, only that contact's. Nothing at all when there is none.
 */
export function SentRequests({ payer, label = 'Requests you sent' }: { payer?: string; label?: string }) {
  const { status, data, identity } = useContext(PaykitContext)
  if ((status !== 'ready' && status !== 'restarting') || !identity) return null
  const remembered = readSent(identity)
  const items: SentItem[] = data.activity
    .filter((activity) => activity.requestHash && (!payer || activity.payer === payer))
    .map((activity) => ({ activity, sent: remembered[activity.requestHash as string] }))
    .sort((a, b) => (b.sent?.createdAtMs ?? 0) - (a.sent?.createdAtMs ?? 0))
  if (!items.length) return null
  const contacts = readContacts()
  return (
    <section className='settings-section paykit-requests' data-testid='paykit-sent'>
      <p className='settings-section-label'>{label}</p>
      <div className='contact-list settings-row-group'>
        {items.map((item) => (
          <SentRow key={item.activity.record} item={item} contacts={contacts} fromContactPage={Boolean(payer)} />
        ))}
      </div>
    </section>
  )
}

/**
 * On a connected contact's page: the private payment details both sides share (Private Payment Lists). The
 * wallet shares its own by itself once the contact is connected; the contact's show once they arrive, as the
 * kind of address and the address, shortened. Nothing while the contact is not connected.
 */
export function PrivateDetails({ contact, name }: { contact: string; name: string }) {
  const { status, data } = useContext(PaykitContext)
  if (status !== 'ready' && status !== 'restarting') return null
  if (data.connections[contact] !== 'connected') return null
  const shared = Boolean(data.sharedList?.recipients.includes(contact))
  const theirs = privateEndpointOf(data.receivedLists, contact)
  return (
    <section className='settings-section paykit-requests' data-testid='paykit-private-details'>
      <p className='settings-section-label'>Private payment details</p>
      <div className='contact-list settings-row-group'>
        <div
          className='settings-row paykit-detail-row'
          data-testid='paykit-share-details'
          data-state={shared ? 'shared' : 'sharing'}
        >
          <span className='settings-row__main'>
            <span className='settings-row__icon' aria-hidden='true'>
              <ShieldIcon />
            </span>
            <span className='contact-list-item-copy'>
              <strong>Your details</strong>
              <small>{shared ? `Shared with ${name}` : `Sharing with ${name}…`}</small>
            </span>
          </span>
          <span
            className={`paykit-request__status paykit-request__status--${shared ? 'paid' : 'pending'}`}
            data-testid='paykit-share-status'
          >
            {shared ? 'Shared' : 'Sharing'}
          </span>
        </div>
        <div
          className='settings-row paykit-detail-row'
          data-testid='paykit-contact-details'
          data-state={theirs ? 'received' : 'waiting'}
          data-endpoint={theirs?.endpointId}
          data-address={theirs?.address}
        >
          <span className='settings-row__main'>
            <span className='contact-avatar contact-avatar--row paykit-detail-row__avatar' aria-hidden='true'>
              {initialFor(name)}
            </span>
            <span className='contact-list-item-copy'>
              <strong>{`${name}'s details`}</strong>
              <small data-testid='paykit-contact-details-method'>
                {theirs ? methodName(theirs.endpointId) : `${name} has not shared details yet`}
              </small>
              {theirs ? (
                <small className='paykit-detail-row__address' data-testid='paykit-contact-details-address'>
                  {prettyLongText(theirs.address, 10)}
                </small>
              ) : null}
            </span>
          </span>
          <span
            className={`paykit-request__status paykit-request__status--${theirs ? 'paid' : 'expired'}`}
            data-testid='paykit-contact-details-status'
          >
            {theirs ? 'Shared with you' : 'Not yet'}
          </span>
        </div>
      </div>
      <p className='paykit-contact-hint paykit-detail-hint'>
        Only you and {name} can see these. A payment request between you can be paid to these details instead of an
        address in the request.
      </p>
    </section>
  )
}
