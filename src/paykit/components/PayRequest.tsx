import CheckMarkIcon from '../../icons/CheckMark'
import { prettyLongText } from '../../lib/format'
import type { PaykitSend } from '../pay'
import './Paykit.css'
import '../../screens/Settings/Contacts.css'

const initialFor = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

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

/** The steps of paying a request, while the payment is in flight. */
export function PayRequestProgress({ request, step, txid }: { request: PaykitSend; step: PayStep; txid?: string }) {
  const at = ORDER.indexOf(step)
  const items = [
    { title: 'Payment approved', detail: `You approved ${request.name}'s request.`, done: true },
    {
      title: at <= 1 ? 'Waiting for the next batch round' : 'Batch round complete',
      detail: 'Your bitcoin leaves Arkade in the next on-chain batch.',
      done: at >= 2,
    },
    {
      title: 'Paid on-chain',
      detail: txid ? `Transaction ${prettyLongText(txid, 8)}` : `To ${prettyLongText(request.address, 10)}`,
      done: at >= 2,
    },
    {
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
          <div key={item.title} className={`paykit-pay-step paykit-pay-step--${state}`}>
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
