import type { Page } from '@playwright/test'
import { test, expect } from '../utils'
import {
  Peer,
  addAndConnect,
  boardingAddress,
  connectedWallet,
  mainBalanceSats,
  openContacts,
  satsPaidTo,
  shot,
} from './helpers'

const projectSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

const SATS = 15_000
const NOTE = 'Dinner at Mario’s'

/** From the connected contact's page, asks for `sats` with `note`; returns the sent request's hash. */
async function requestFromContact(page: Page, sats: number, note: string, onForm?: () => Promise<void>) {
  await page.getByTestId('paykit-request-contact').click()
  await expect(page.getByTestId('paykit-new-request')).toBeVisible()
  const send = page.getByTestId('paykit-request-send')
  await expect(send).toBeDisabled()
  await page.getByTestId('paykit-request-amount').locator('input').fill(String(sats))
  await page.getByTestId('paykit-request-memo').fill(note)
  await expect(send).toBeEnabled()
  await onForm?.()
  await send.click()
  const card = page.getByTestId('paykit-sent-request')
  await expect(card).toBeVisible({ timeout: 30_000 })
  const hash = (await card.getAttribute('data-request-hash')) ?? ''
  expect(hash).toMatch(/^[0-9a-f]{64}$/)
  return hash
}

test('requests money from a contact, verifies the on-chain payment and sends a receipt', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const peer = Peer.create(`w4-${projectSlug(testInfo.project.name)}`)
  peer.must('fund', 'funded', '200000')
  const walletId = await connectedWallet(page, peer)
  const boarding = await boardingAddress(page)
  const balanceBefore = await mainBalanceSats(page)

  await addAndConnect(page, peer, 'Alice')
  await expect(page.getByText('Copied to clipboard')).toHaveCount(0, { timeout: 10_000 })
  await shot(page, testInfo, 'request-contact')

  // The peer pays every request it receives, on-chain from its bitcoind wallet.
  const run = peer.start('--auto-pay')
  try {
    const hash = await requestFromContact(page, SATS, NOTE, () => shot(page, testInfo, 'request-form'))
    const card = page.getByTestId('paykit-sent-request')
    await expect(card).toHaveAttribute('data-payer', peer.id)
    await expect(page.getByTestId('paykit-sent-note')).toHaveText(NOTE)
    await expect(page.getByTestId('primary-amount')).toContainText(/15,000|0\.00015/)
    await shot(page, testInfo, 'request-sent')

    // The peer received it and paid the wallet's boarding address.
    const received = await run.waitFor('request_received', { request_hash: hash })
    expect(received.from).toBe(walletId)
    expect(Number(received.sats)).toBe(SATS)
    expect(received.reference).toBe(NOTE)
    const paid = await run.waitFor('paid', { request_hash: hash })
    expect(paid.endpoint_id).toBe('btc-regtest-p2tr')
    expect(paid.address).toBe(boarding)
    const txid = String(paid.txid)

    // The wallet verified the transaction on-chain, confirmed it and sent its receipt.
    await expect(card).toHaveAttribute('data-status', 'receipted', { timeout: 60_000 })
    await expect(card).toHaveAttribute('data-txid', txid)
    await expect(page.getByTestId('paykit-sent-status')).toHaveText('Received')
    await expect(page.getByTestId('paykit-sent-state')).toHaveAttribute('data-state', 'received')
    await shot(page, testInfo, 'request-received')

    const receipt = await run.waitFor('receipt_received', { request_hash: hash }, 60_000)
    expect(receipt.txid).toBe(txid)
    const onChain = await satsPaidTo(txid, boarding)
    expect(onChain).toBeGreaterThanOrEqual(SATS)
    console.log(`esplora: ${txid} pays ${onChain} sats to ${boarding}`)
    console.log(`peer: paid ${paid.sats} sats, receipt ${receipt.msg_id}`)

    // The contact's list shows it received.
    await page.getByTestId('paykit-sent-done').click()
    const row = page.getByTestId('paykit-activity-row').and(page.locator(`[data-request-hash="${hash}"]`))
    await expect(row).toHaveAttribute('data-status', 'receipted')
    await expect(row).toContainText('Received')
    await shot(page, testInfo, 'request-contact-received')
  } finally {
    await run.stop()
  }

  // The balance rose by the amount (the coin shows while it boards).
  await expect.poll(() => mainBalanceSats(page), { timeout: 60_000 }).toBe(balanceBefore + SATS)
  console.log(`balance: ${balanceBefore} -> ${balanceBefore + SATS} sats`)
  await shot(page, testInfo, 'request-balance')
  await openContacts(page)
  await shot(page, testInfo, 'request-contacts')
})

test('does not confirm a payment that pays too little', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const peer = Peer.create(`w4-short-${projectSlug(testInfo.project.name)}`)
  peer.must('fund', 'funded', '200000')
  await connectedWallet(page, peer)
  await addAndConnect(page, peer, 'Bob')

  // The peer pays 1,000 sats less than asked; its proof names that real transaction.
  const run = peer.start('--auto-pay', '--short-pay', '1000')
  try {
    const hash = await requestFromContact(page, SATS, 'Taxi')
    const paid = await run.waitFor('paid', { request_hash: hash })
    expect(Number(paid.sats)).toBe(SATS - 1_000)

    const card = page.getByTestId('paykit-sent-request')
    await expect(card).toHaveAttribute('data-check', 'short', { timeout: 60_000 })
    await expect(card).toHaveAttribute('data-status', 'proofReceived')
    await expect(page.getByTestId('paykit-sent-status')).toHaveText('Paid too little')
    const state = page.getByTestId('paykit-sent-state')
    await expect(state).toHaveAttribute('data-state', 'short')
    await expect(state).toContainText(/14,000 sats of the 15,000 sats/)
    await shot(page, testInfo, 'request-short')

    // No receipt goes to the payer, and the request does not turn received.
    await page.waitForTimeout(10_000)
    expect(run.events.some((line) => line.event === 'receipt_received' && line.request_hash === hash)).toBe(false)
    await expect(card).toHaveAttribute('data-status', 'proofReceived')

    await page.getByTestId('paykit-sent-done').click()
    const row = page.getByTestId('paykit-activity-row').and(page.locator(`[data-request-hash="${hash}"]`))
    await expect(row).toHaveAttribute('data-check', 'short')
    await expect(row).toContainText('Paid too little')
    await shot(page, testInfo, 'request-short-contact')
  } finally {
    await run.stop()
  }
})
