import { motion } from 'framer-motion'
import { useContext, useEffect, useState } from 'react'
import Table, { type TableData } from '../../components/Table'
import Text, { TextSecondary } from '../../components/Text'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import CheckMarkIcon from '../../icons/CheckMark'
import HashIcon from '../../icons/Hash'
import ShieldIcon from '../../icons/ShieldCheckOutline'
import SuccessIcon from '../../icons/Success'
import TypeIcon from '../../icons/Type'
import { EASE_OUT_QUINT_TUPLE } from '../../lib/animations'
import { prettyBitcoinAmount, prettyDate, prettyLongText } from '../../lib/format'
import { ConfigContext } from '../../providers/config'
import { requestKeyOf, shortAddress, type PaykitSend } from '../pay'
import { PaykitContext } from '../provider'
import { requestStatus } from './ContactsPaykit'
import './Paykit.css'
import '../../screens/Settings/Contacts.css'

const initialFor = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

const seconds = (ms: number) => Math.floor(ms / 1000)

/** On the send screen: which contact's request this send pays, and its note. */
export function PayRequestContext({ request }: { request: PaykitSend }) {
  return (
    <div className='paykit-pay-context' data-testid='paykit-pay-context'>
      <span className='contact-avatar' aria-hidden='true'>
        {initialFor(request.name)}
      </span>
      <span className='paykit-receipt__copy'>
        <strong>Payment request from {request.name}</strong>
        <small>{request.note}</small>
      </span>
    </div>
  )
}

/**
 * Where paying a request stands:
 * - `preparing`: the wallet picks the coins and quotes the on-chain send;
 * - `batch`: the collaborative exit waits for the operator's batch round;
 * - `paid`: the batch transaction pays the address;
 * - `proof-sent`: the engine sent the proof to the contact, who confirms with a receipt.
 */
export type PayStep = 'preparing' | 'batch' | 'paid' | 'proof-sent'

const ORDER: PayStep[] = ['preparing', 'batch', 'paid', 'proof-sent']

/**
 * The least time each step stays on screen, so a quick batch round still shows every step ticking by. It is short on
 * purpose: the contact's wallet marks the request paid as soon as the proof arrives, and a longer hold here would
 * still show "Waiting for the next batch round" while the contact already shows the request paid.
 */
export const STEP_DWELL_MS = 300
/** How long the finished steps stay before the success view replaces them. */
export const DONE_BEAT_MS = 900

/**
 * The step to show for the step reached: it follows `step` one step at a time, each on screen for at least
 * `STEP_DWELL_MS`. A step going back (a retry) shows at once. It never runs ahead of `step`.
 */
export function usePacedStep(step: PayStep, active: boolean): PayStep {
  const [shown, setShown] = useState<PayStep>(step)
  useEffect(() => {
    if (!active) return setShown(step)
    const at = ORDER.indexOf(shown)
    const target = ORDER.indexOf(step)
    if (target < at) return setShown(step)
    if (target === at) return
    const timer = setTimeout(() => setShown(ORDER[at + 1]), STEP_DWELL_MS)
    return () => clearTimeout(timer)
  }, [step, shown, active])
  return shown
}

/** The steps of paying a request, while the payment is in flight. */
export function PayRequestProgress({ request, step, txid }: { request: PaykitSend; step: PayStep; txid?: string }) {
  const at = ORDER.indexOf(step)
  const items = [
    { id: 'approved', title: 'Payment approved', detail: `You approved ${request.name}'s request.`, done: true },
    {
      id: 'batch',
      title: at <= 1 ? 'Waiting for the next batch round' : 'Batch round complete',
      detail: 'Your bitcoin leaves Arkade in the next on-chain batch.',
      done: at >= 2,
    },
    {
      id: 'paid',
      title: 'Paid on-chain',
      detail: txid && at >= 2 ? `Transaction ${prettyLongText(txid, 8)}` : `To ${shortAddress(request.address)}`,
      done: at >= 2,
    },
    {
      id: 'proof',
      title: `Proof sent to ${request.name}`,
      detail: `${request.name} confirms with a receipt.`,
      done: at >= 3,
    },
  ]
  // The first step not done is the one in progress.
  const active = items.findIndex((item) => !item.done)
  return (
    <div className='paykit-pay-steps' data-testid='paykit-pay-progress' data-stage={step} data-txid={txid}>
      {items.map((item, index) => {
        const state = item.done ? 'done' : index === active ? 'active' : 'todo'
        return (
          <div key={item.id} className={`paykit-pay-step paykit-pay-step--${state}`}>
            <span className='paykit-pay-step__icon' aria-hidden='true'>
              {state === 'done' ? (
                <CheckMarkIcon small />
              ) : state === 'active' ? (
                <span className='paykit-spinner' />
              ) : null}
            </span>
            <span className='paykit-pay-step__copy'>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The end of paying a request: the payment is sent, and it stays on screen until the user goes on. The
 * contact's receipt shows here when it arrives. Carries the request's test IDs (`paykit-request`, its status
 * and receipt), as the request screen does.
 */
export function PayRequestDone({ request, txid }: { request: PaykitSend; txid?: string }) {
  const { data } = useContext(PaykitContext)
  const { config } = useContext(ConfigContext)
  const prefersReduced = useReducedMotion()
  const key = requestKeyOf(request.id)
  const record = data.requests.find((item) => requestKeyOf(item.id) === key)
  const receipt = record?.receipt
  const status = requestStatus(record?.status ?? 'paid', Boolean(receipt))
  const amount = prettyBitcoinAmount(request.sats, config.unit)
  const rows: TableData = [
    ['Pay to', request.address, <TypeIcon key='to' />],
    ['Payment details', request.listApp ? `Shared privately by ${request.name}` : undefined, <ShieldIcon key='pd' />],
    ['Transaction ID', txid, <HashIcon key='txid' />],
  ]
  const appear = (delay: number) =>
    prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.28, ease: EASE_OUT_QUINT_TUPLE },
        }

  return (
    <div className='paykit-pay-done'>
      <section
        className='paykit-pay-done__head'
        data-testid='paykit-request'
        data-request-hash={request.id.requestHash}
        data-payee={request.id.payee}
        data-status={record?.status}
        data-receipt={receipt ? 'received' : 'none'}
        data-txid={txid}
        data-destination={request.listApp ? 'any' : 'endpoints'}
        data-pay-to={request.address}
      >
        <motion.span
          className='paykit-pay-done__mark'
          initial={prefersReduced ? false : { opacity: 0, scale: 0.9 }}
          animate={prefersReduced ? undefined : { opacity: 1, scale: 1 }}
          transition={prefersReduced ? { duration: 0 } : { type: 'spring', duration: 0.42, bounce: 0.18 }}
        >
          <SuccessIcon small />
        </motion.span>
        <motion.div className='paykit-pay-done__copy' {...appear(0.12)}>
          <Text centered big bold>
            Payment sent
          </Text>
          <TextSecondary centered>
            You paid {request.name} {amount}
            {request.note ? ` for ${request.note}` : ''}.
          </TextSecondary>
          <span className={`paykit-status-pill paykit-status-pill--${status.tone}`} data-testid='paykit-request-status'>
            {status.text}
          </span>
        </motion.div>
      </section>

      <motion.div className='paykit-pay-done__receipt' {...appear(0.24)}>
        {receipt ? (
          <motion.div
            key='receipt'
            className='paykit-receipt'
            data-testid='paykit-request-receipt'
            data-attempt={receipt.attemptId}
            {...(prefersReduced
              ? {}
              : {
                  initial: { opacity: 0, scale: 0.98 },
                  animate: { opacity: 1, scale: 1 },
                  transition: { duration: 0.24 },
                })}
          >
            <span className='paykit-receipt__icon' aria-hidden='true'>
              <CheckMarkIcon small />
            </span>
            <span className='paykit-receipt__copy'>
              <strong>Receipt from {request.name}</strong>
              <small>
                {receipt.acceptedAtMs
                  ? `${request.name} confirmed the payment on ${prettyDate(seconds(receipt.acceptedAtMs))}.`
                  : `${request.name} confirmed the payment.`}
              </small>
            </span>
          </motion.div>
        ) : (
          <div
            key='waiting'
            className='paykit-receipt paykit-receipt--waiting'
            data-testid='paykit-request-awaiting-receipt'
          >
            <span className='paykit-receipt__icon' aria-hidden='true'>
              <span className='paykit-spinner' />
            </span>
            <span className='paykit-receipt__copy'>
              <strong>Waiting for {request.name}&apos;s receipt</strong>
              <small>{request.name} confirms once the payment shows on-chain.</small>
            </span>
          </div>
        )}
      </motion.div>

      <motion.div {...appear(0.3)}>
        <Table data={rows} />
      </motion.div>
    </div>
  )
}
