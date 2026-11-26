import { useContext, useMemo } from 'react'
import type { Tx } from '../lib/types'
import { payeeName, requestKeyOf } from './pay'
import { PaykitContext } from './provider'
import type { OneTimeRequest } from './protocol'
import { readSent } from './receive'
import { readAttempts } from './walletRail'

/** A wallet transaction that paid, or was paid for, a Payment Request: the contact and the request's note. */
export interface PaykitPayment {
  name: string
  note: string
}

/**
 * The Paykit payments this device made and received, by on-chain txid:
 * - paid: the attempt records of this wallet's rail (the batch transaction of the collaborative exit), with the
 *   note of the request they paid;
 * - received: the requests this wallet sent, once a payer's transaction was confirmed for them.
 */
export const paykitPaymentsByTxid = (ownId: string, requests: OneTimeRequest[]): Map<string, PaykitPayment> => {
  const byTxid = new Map<string, PaykitPayment>()
  for (const attempt of Object.values(readAttempts(ownId))) {
    if (attempt.status !== 'paid' || !attempt.txid || !attempt.requestKey) continue
    const payee = attempt.requestKey.split('/')[0]
    const request = requests.find((item) => requestKeyOf(item.id) === attempt.requestKey)
    byTxid.set(attempt.txid, { name: payeeName(payee), note: request?.paymentReference ?? '' })
  }
  for (const sent of Object.values(readSent(ownId))) {
    if (!sent.txid) continue
    byTxid.set(sent.txid, { name: payeeName(sent.to), note: sent.note })
  }
  return byTxid
}

/** The Paykit payment a history row is, matched on any of the row's transaction IDs. */
export const paykitPaymentOf = (payments: Map<string, PaykitPayment>, tx: Tx): PaykitPayment | undefined => {
  for (const txid of [tx.roundTxid, tx.boardingTxid, tx.redeemTxid, tx.explorable]) {
    const payment = txid ? payments.get(txid) : undefined
    if (payment) return payment
  }
  return undefined
}

/** For history lists: the Paykit payments of the running identity, read again as its requests change. */
export function usePaykitPayments(): Map<string, PaykitPayment> {
  const { identity, data } = useContext(PaykitContext)
  return useMemo(
    () => (identity ? paykitPaymentsByTxid(identity, data.requests) : new Map()),
    // `activity` and `checks` change when a received payment is confirmed; `requests` when one is paid.
    [identity, data.requests, data.activity, data.checks],
  )
}
