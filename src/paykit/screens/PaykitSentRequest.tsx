import { useContext } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Table, { type TableData } from '../../components/Table'
import TransactionAmountSummary from '../../components/TransactionAmountSummary'
import { useAmountDisplayContext } from '../../hooks/useTransactionAmountDisplay'
import AmountIcon from '../../icons/Amount'
import CheckMarkIcon from '../../icons/CheckMark'
import DateIcon from '../../icons/Date'
import HashIcon from '../../icons/Hash'
import StatusIcon from '../../icons/Status'
import TypeIcon from '../../icons/Type'
import UsersRound from '../../icons/UsersRound'
import ShieldIcon from '../../icons/ShieldCheckOutline'
import { prettyBitcoinAmount, prettyDate } from '../../lib/format'
import { buildTransactionAmountDisplay } from '../../lib/transactionAmountDisplay'
import { ConfigContext } from '../../providers/config'
import { NavigationContext } from '../../providers/navigation'
import { sentStatus } from '../components/ContactsPaykit'
import { btcToSats } from '../contacts'
import { payeeName, shortPubky } from '../pay'
import { PaykitContext } from '../provider'
import { lastCheckOf, readSent } from '../receive'
import '../../screens/Settings/Contacts.css'
import '../components/Paykit.css'

const initialFor = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

const seconds = (ms: number) => Math.floor(ms / 1000)

/** In words, why the engine did not credit a payment (`refused` reasons, `pkg/API.md` section 8). */
const notConfirmedText = (reason: string | undefined, name: string): string => {
  switch (reason) {
    case 'paymentTimeOutside':
      return `The transaction ${name} named was made before this request, so it does not pay it.`
    case 'maybeCredited':
      return `That transaction already paid another request.`
    default:
      // Never the engine's own words: an unknown reason reads as the general case.
      return `The payment ${name} sent could not be confirmed.`
  }
}

/**
 * One Payment Request this wallet sent: who pays, how much and what for, and where it stands. When the payer's
 * proof arrives, the wallet checks the transaction on-chain by itself, and if it pays the amount, confirms it
 * and sends a receipt: the request turns Received and the bitcoin shows in the balance.
 */
export default function PaykitSentRequest() {
  const { focusedSent, data, identity } = useContext(PaykitContext)
  const { config } = useContext(ConfigContext)
  const { goBack } = useContext(NavigationContext)
  const displayContext = useAmountDisplayContext()

  const activity = focusedSent ? data.activity.find((item) => item.requestHash === focusedSent) : undefined
  const sent = identity && focusedSent ? readSent(identity)[focusedSent] : undefined

  if (!activity || !focusedSent) {
    return (
      <>
        <Header text='Payment request' back />
        <Content>
          <Padded>
            <div className='contact-empty' data-testid='paykit-sent-missing'>
              <UsersRound size={24} />
              <h2>{data.activityLoaded ? 'Request not found' : 'Loading payment request…'}</h2>
              {data.activityLoaded ? <p>This payment request is no longer on this device.</p> : null}
            </div>
          </Padded>
        </Content>
      </>
    )
  }

  const name = payeeName(activity.payer)
  const sats = activity.amount?.asset === 'btc' ? btcToSats(activity.amount.value) : sent?.sats
  const check = data.checks[activity.record]
  const lastCheck = lastCheckOf(activity.attemptId)
  const status = sentStatus(activity.status, check)
  const received = activity.status === 'receipted' || check?.state === 'confirmed'
  const txid = sent?.txid ?? check?.txid ?? (lastCheck && lastCheck.kind !== 'invalid' ? lastCheck.txid : undefined)
  const receivedSats = sent?.receivedSats ?? check?.receivedSats
  const paidAtMs = sent?.paidAtMs ?? (lastCheck?.kind === 'verified' ? lastCheck.paidAtMs : undefined)
  const amountDisplay = buildTransactionAmountDisplay({ ...displayContext, satoshis: sats ?? 0 })
  const amountText = (value: number) => prettyBitcoinAmount(value, config.unit)
  const privateDetails = sent?.destination === 'any'
  const payTo = privateDetails ? 'your private payment details' : 'your bitcoin address'

  // What the request waits for, or what came of it.
  let state: { tone: 'waiting' | 'warning' | 'done'; title: string; detail: string; key: string } | undefined
  if (received) {
    state = {
      key: 'received',
      tone: 'done',
      title: 'Payment received',
      detail: `${name} paid${paidAtMs ? ` on ${prettyDate(seconds(paidAtMs))}` : ''}. You sent a receipt, and the bitcoin is in your balance.`,
    }
  } else if (activity.status === 'requested' || activity.status === 'accepted') {
    state = {
      key: 'waiting',
      tone: 'waiting',
      title: `Waiting for ${name} to pay`,
      detail: `${name} pays on-chain to ${payTo}. Your wallet confirms it as soon as it arrives.`,
    }
  } else if (activity.status === 'proofReceived' && check?.state === 'short') {
    state = {
      key: 'short',
      tone: 'warning',
      title: 'Payment too small',
      detail: `${name}'s transaction pays ${amountText(check.receivedSats ?? 0)} of the ${amountText(sats ?? 0)} you asked for. It is not confirmed and no receipt was sent.`,
    }
  } else if (activity.status === 'proofReceived' && check?.state === 'refused') {
    state = {
      key: 'refused',
      tone: 'warning',
      title: 'Payment not confirmed',
      detail: notConfirmedText(check.reason, name),
    }
  } else if (activity.status === 'proofReceived') {
    state = {
      key: 'checking',
      tone: 'waiting',
      title: `Checking ${name}'s payment`,
      detail: `${name} sent the payment. Your wallet is finding it on-chain.`,
    }
  } else if (activity.status === 'rejected') {
    state = { key: 'declined', tone: 'warning', title: `${name} declined`, detail: 'No payment was made.' }
  }

  const rows: TableData = [
    ['From', name, <UsersRound key='from' size={16} />],
    ['Pay to', sent?.address, <TypeIcon key='to' />],
    ['Payment details', privateDetails ? 'Your private details' : undefined, <ShieldIcon key='details' />],
    ['Status', status.text, <StatusIcon key='status' />],
    [
      'Received',
      receivedSats !== undefined && received ? amountText(receivedSats) : undefined,
      <AmountIcon key='received' />,
    ],
    ['Transaction ID', txid, <HashIcon key='txid' />],
    ['Requested on', sent ? prettyDate(seconds(sent.createdAtMs)) : undefined, <DateIcon key='requested-on' />],
  ]

  return (
    <>
      <Header text='Payment request' back />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <section
              className='contact-identity paykit-request-card'
              data-testid='paykit-sent-request'
              data-request-hash={activity.requestHash ?? undefined}
              data-payer={activity.payer}
              data-status={activity.status}
              data-check={check?.state ?? 'none'}
              data-txid={txid}
              data-received-sats={receivedSats}
              data-destination={sent?.destination ?? 'endpoints'}
            >
              <span className='contact-avatar' aria-hidden='true'>
                {initialFor(name)}
              </span>
              <div className='contact-identity-copy'>
                <h2>{name}</h2>
                <span className='paykit-request-card__pubky'>{shortPubky(activity.payer)}</span>
                <span
                  className={`paykit-status-pill paykit-status-pill--${status.tone}`}
                  data-testid='paykit-sent-status'
                >
                  {status.text}
                </span>
              </div>
            </section>

            {amountDisplay ? <TransactionAmountSummary amount={amountDisplay} label='You requested' /> : null}
            {sent?.note ? (
              <p className='paykit-request-note' data-testid='paykit-sent-note'>
                {sent.note}
              </p>
            ) : null}

            {state ? (
              <div
                className={`paykit-receipt${state.tone === 'waiting' ? ' paykit-receipt--waiting' : ''}${
                  state.tone === 'warning' ? ' paykit-receipt--warning' : ''
                }`}
                data-testid='paykit-sent-state'
                data-state={state.key}
              >
                <span className='paykit-receipt__icon' aria-hidden='true'>
                  {state.tone === 'waiting' ? (
                    <span className='paykit-spinner' />
                  ) : state.tone === 'done' ? (
                    <CheckMarkIcon small />
                  ) : (
                    '!'
                  )}
                </span>
                <span className='paykit-receipt__copy'>
                  <strong>{state.title}</strong>
                  <small>{state.detail}</small>
                </span>
              </div>
            ) : null}

            <Table data={rows} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label='Done' onClick={goBack} testId='paykit-sent-done' />
      </ButtonsOnBottom>
    </>
  )
}
