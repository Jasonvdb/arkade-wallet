import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Content from '../../components/Content'
import ErrorMessage from '../../components/Error'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Table, { type TableData } from '../../components/Table'
import TransactionAmountSummary from '../../components/TransactionAmountSummary'
import { useAmountDisplayContext } from '../../hooks/useTransactionAmountDisplay'
import CheckMarkIcon from '../../icons/CheckMark'
import DateIcon from '../../icons/Date'
import HashIcon from '../../icons/Hash'
import StatusIcon from '../../icons/Status'
import TypeIcon from '../../icons/Type'
import UsersRound from '../../icons/UsersRound'
import { prettyDate, prettyLongText } from '../../lib/format'
import { buildTransactionAmountDisplay } from '../../lib/transactionAmountDisplay'
import { emptySendInfo, FlowContext } from '../../providers/flow'
import { NavigationContext, Pages } from '../../providers/navigation'
import { btcToSats } from '../contacts'
import { isActionable, paymentOf, payeeName, refusalText, requestKeyOf, shortPubky } from '../pay'
import { PaykitCallError } from '../protocol'
import { PaykitContext } from '../provider'
import { attemptForRequest } from '../walletRail'
import { requestStatus } from '../components/ContactsPaykit'
import '../../screens/Settings/Contacts.css'
import '../components/Paykit.css'

const initialFor = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

const seconds = (ms: number) => Math.floor(ms / 1000)

/**
 * One Payment Request a contact sent this wallet: who asks, how much and what for, with Approve and Decline
 * while it is open, and the payment and the contact's receipt once it is paid. Approve opens the wallet's
 * own send confirmation, which pays the request on-chain.
 */
export default function PaykitRequest() {
  const { focusedRequest, data, call, identity } = useContext(PaykitContext)
  const { setSendInfo } = useContext(FlowContext)
  const { navigate, goBack } = useContext(NavigationContext)
  const displayContext = useAmountDisplayContext()
  const [error, setError] = useState('')
  const [declining, setDeclining] = useState(false)
  const [busy, setBusy] = useState(false)

  const key = focusedRequest ? requestKeyOf(focusedRequest) : undefined
  const request = key ? data.requests.find((item) => requestKeyOf(item.id) === key) : undefined
  const sats = request && request.amount.asset === 'btc' ? btcToSats(request.amount.value) : undefined

  useEffect(() => {
    setError('')
    setDeclining(false)
  }, [request?.status])

  if (!request || !key) {
    return (
      <>
        <Header text='Payment request' back />
        <Content>
          <Padded>
            <div className='contact-empty' data-testid='paykit-request-missing'>
              <UsersRound size={24} />
              <h2>{data.requestsLoaded ? 'Request not found' : 'Loading payment request…'}</h2>
              {data.requestsLoaded ? <p>This payment request is no longer on this device.</p> : null}
            </div>
          </Padded>
        </Content>
      </>
    )
  }

  const name = payeeName(request.id.payee)
  const actionable = isActionable(request)
  const payment = paymentOf(request)
  const attempt = identity ? attemptForRequest(identity, key) : undefined
  const receipt = request.receipt
  const status = requestStatus(request.status, Boolean(receipt))
  const amountDisplay = buildTransactionAmountDisplay({ ...displayContext, satoshis: sats ?? 0 })

  const approve = () => {
    if ('error' in payment) return setError(payment.error)
    setSendInfo({
      ...emptySendInfo,
      address: payment.address,
      recipient: payment.address,
      satoshis: payment.sats,
      paykit: { ...payment, name },
    })
    navigate(Pages.SendDetails)
  }

  const decline = async () => {
    if (!declining) return setDeclining(true)
    setBusy(true)
    setError('')
    try {
      await call('rejectRequest', { id: request.id, reason: 'Declined by the payer' })
    } catch (err) {
      setError(
        err instanceof PaykitCallError && err.code === 'refused'
          ? refusalText(err.reason, name)
          : 'The request could not be declined. Try again in a moment.',
      )
    } finally {
      setBusy(false)
      setDeclining(false)
    }
  }

  const rows: TableData = [
    ['From', name, <UsersRound key='from' size={16} />],
    ['Pay to', 'address' in payment ? prettyLongText(payment.address, 12) : undefined, <TypeIcon key='to' />],
    ['Status', status.text, <StatusIcon key='status' />],
    ['Transaction ID', attempt?.txid, <HashIcon key='txid' />],
    ['Paid on', attempt?.paidAtMs ? prettyDate(seconds(attempt.paidAtMs)) : undefined, <DateIcon key='paid-on' />],
  ]

  return (
    <>
      <Header text='Payment request' back />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <section
              className='contact-identity paykit-request-card'
              data-testid='paykit-request'
              data-request-hash={request.id.requestHash}
              data-payee={request.id.payee}
              data-status={request.status}
              data-receipt={receipt ? 'received' : 'none'}
              data-txid={attempt?.txid}
            >
              <span className='contact-avatar' aria-hidden='true'>
                {initialFor(name)}
              </span>
              <div className='contact-identity-copy'>
                <h2>{name}</h2>
                <span className='paykit-request-card__pubky'>{shortPubky(request.id.payee)}</span>
                <span
                  className={`paykit-status-pill paykit-status-pill--${status.tone}`}
                  data-testid='paykit-request-status'
                >
                  {status.text}
                </span>
              </div>
            </section>

            {amountDisplay ? <TransactionAmountSummary amount={amountDisplay} label={`${name} requests`} /> : null}
            <p className='paykit-request-note' data-testid='paykit-request-note'>
              {request.paymentReference}
            </p>

            <ErrorMessage error={Boolean(error)} text={error} />

            {receipt ? (
              <div className='paykit-receipt' data-testid='paykit-request-receipt' data-attempt={receipt.attemptId}>
                <span className='paykit-receipt__icon' aria-hidden='true'>
                  <CheckMarkIcon small />
                </span>
                <span className='paykit-receipt__copy'>
                  <strong>Receipt from {name}</strong>
                  <small>
                    {receipt.acceptedAtMs
                      ? `${name} confirmed the payment on ${prettyDate(seconds(receipt.acceptedAtMs))}.`
                      : `${name} confirmed the payment.`}
                  </small>
                </span>
              </div>
            ) : request.status === 'paid' || attempt?.status === 'paying' ? (
              <div className='paykit-receipt paykit-receipt--waiting' data-testid='paykit-request-awaiting-receipt'>
                <span className='paykit-receipt__icon' aria-hidden='true'>
                  <span className='paykit-spinner' />
                </span>
                <span className='paykit-receipt__copy'>
                  <strong>{request.status === 'paid' ? `Waiting for ${name}'s receipt` : 'Payment on its way'}</strong>
                  <small>
                    {request.status === 'paid'
                      ? `${name} confirms once the payment shows on-chain.`
                      : 'The payment joins the next batch round.'}
                  </small>
                </span>
              </div>
            ) : null}

            <Table data={rows} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {actionable ? (
          <>
            <Button
              label='Approve'
              onClick={approve}
              disabled={busy || 'error' in payment}
              testId='paykit-incoming-approve'
            />
            <Button
              label={declining ? 'Confirm decline' : 'Decline'}
              secondary
              loading={busy}
              onClick={decline}
              testId='paykit-incoming-decline'
            />
          </>
        ) : (
          <Button label='Done' onClick={goBack} testId='paykit-request-done' />
        )}
      </ButtonsOnBottom>
    </>
  )
}
