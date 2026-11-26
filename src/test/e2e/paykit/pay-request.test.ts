import type { Page, TestInfo } from '@playwright/test'
import { test, expect } from '../utils'
import {
  Peer,
  addAndConnect,
  arkdemo,
  boardingAddress,
  connectedWallet,
  openContacts,
  satsPaidTo,
  shot,
} from './helpers'
import { translations } from '../../../lib/i18n'

const tr = translations.en
const projectSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

/** Opens the request `hash` from the contact's page. */
async function openRequest(page: Page, hash: string) {
  const row = page.getByTestId('paykit-incoming-row').and(page.locator(`[data-request-hash="${hash}"]`))
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.getByTestId('paykit-request')).toHaveAttribute('data-request-hash', hash)
}

/**
 * Waits until the send screen offers to sign. Coins that are still boarding cannot leave by exit: the screen
 * then says the bitcoin is still settling and offers to try again, which this repeats until they settled.
 */
async function waitUntilSignable(page: Page, testInfo: TestInfo) {
  const button = page.getByTestId('paykit-pay-confirm')
  const deadline = Date.now() + 150_000
  let shotSettling = false
  while (Date.now() < deadline) {
    await expect(button).toHaveText(new RegExp(`^(${tr.send.tapToSign}|Try again)$`), { timeout: 30_000 })
    if ((await button.textContent())?.trim() === tr.send.tapToSign) return
    await expect(page.getByText('Your bitcoin is still settling')).toBeVisible()
    if (!shotSettling) {
      await shot(page, testInfo, 'pay-settling')
      shotSettling = true
    }
    await page.waitForTimeout(5_000)
    await button.click()
  }
  throw new Error('the wallet never settled its coins')
}

const NOTE = 'Concert tickets'
const SATS = 10_000

test('pays a contact’s payment request on-chain and shows its receipt', async ({ page }, testInfo) => {
  test.setTimeout(420_000)
  const peer = Peer.create(`w3-${projectSlug(testInfo.project.name)}`)
  const walletId = await connectedWallet(page, peer)

  // Fund the boarding address; the wallet boards the coins by itself while it is open.
  arkdemo('fund', await boardingAddress(page), '0.001')
  await expect(page.getByTestId('main-balance').first()).toHaveText(/100,000|0\.001/, { timeout: 60_000 })

  await addAndConnect(page, peer, 'Alice')
  const sent = peer.must('request', 'request_sent', walletId, String(SATS), '--reference', NOTE)
  expect(String(sent.delivery).toLowerCase()).toBe('accepted')
  const hash = String(sent.request_hash)
  const payTo = String(sent.address)

  // The request: who asks, how much and what for.
  await openRequest(page, hash)
  const card = page.getByTestId('paykit-request')
  await expect(card).toHaveAttribute('data-status', 'open')
  await expect(card).toContainText('Alice')
  await expect(page.getByTestId('paykit-request-note')).toHaveText(NOTE)
  await expect(page.getByTestId('primary-amount')).toContainText(/10,000|0\.0001/)
  await expect(page.getByTestId('paykit-incoming-approve')).toBeEnabled()
  await shot(page, testInfo, 'pay-request')

  // Approve: the wallet's own send confirmation, priced for the on-chain exit.
  await page.getByTestId('paykit-incoming-approve').click()
  await expect(page.getByTestId('paykit-pay-context')).toContainText('Payment request from Alice')
  await waitUntilSignable(page, testInfo)
  await expect(page.getByTestId('primary-amount')).toContainText(/10,000|0\.0001/)
  await shot(page, testInfo, 'pay-confirm')

  // The peer verifies proofs and sends receipts from now on.
  const run = peer.start('--auto-confirm')
  try {
    await page.getByTestId('paykit-pay-confirm').click()
    const progress = page.getByTestId('paykit-pay-progress')
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('data-stage', /preparing|batch/)
    await shot(page, testInfo, 'pay-in-flight')

    // Paid: the request screen follows, with the payment's transaction.
    await expect(card).toHaveAttribute('data-status', 'paid', { timeout: 200_000 })
    const txid = (await card.getAttribute('data-txid')) ?? ''
    expect(txid).toMatch(/^[0-9a-f]{64}$/)

    // The batch transaction pays the peer's address at least the requested amount.
    const paidSats = await satsPaidTo(txid, payTo)
    expect(paidSats).toBeGreaterThanOrEqual(SATS)
    console.log(`esplora: ${txid} pays ${paidSats} sats to ${payTo}`)

    // The peer verified the proof on-chain and sent its receipt; the wallet shows it.
    const verified = await run.waitFor('verified', { request_hash: hash })
    expect(verified.txid).toBe(txid)
    expect(Number(verified.sats_received)).toBeGreaterThanOrEqual(SATS)
    const confirmed = await run.waitFor('confirmed', { request_hash: hash })
    expect(confirmed.txid).toBe(txid)
    console.log(`peer: verified ${verified.sats_received} sats, confirmed with receipt ${confirmed.receipt_msg_id}`)
    await expect(card).toHaveAttribute('data-receipt', 'received', { timeout: 60_000 })
    await expect(page.getByTestId('paykit-request-receipt')).toContainText('Receipt from Alice')
    await expect(page.getByTestId('paykit-request-status')).toHaveText('Paid')
    await shot(page, testInfo, 'pay-paid')
  } finally {
    await run.stop()
  }

  // The contacts list shows the request as paid.
  await page.getByTestId('paykit-request-done').click()
  await openContacts(page)
  const row = page.getByTestId('paykit-incoming-row').and(page.locator(`[data-request-hash="${hash}"]`))
  await expect(row).toHaveAttribute('data-status', 'paid')
  await expect(row).toHaveAttribute('data-receipt', 'received')
  await expect(row).toContainText('Paid')
  await shot(page, testInfo, 'pay-contacts')
})

test('refuses to pay without settled funds, and declines the request', async ({ page }, testInfo) => {
  test.slow()
  const peer = Peer.create(`w3-decline-${projectSlug(testInfo.project.name)}`)
  const walletId = await connectedWallet(page, peer)
  await addAndConnect(page, peer, 'Bob')
  const sent = peer.must('request', 'request_sent', walletId, '25000', '--reference', 'Taxi')
  const hash = String(sent.request_hash)

  // An empty wallet: the send screen says why it cannot pay, and offers nothing to sign.
  await openRequest(page, hash)
  await page.getByTestId('paykit-incoming-approve').click()
  const button = page.getByTestId('paykit-pay-confirm')
  await expect(button).toHaveText(tr.send.insufficientFunds, { timeout: 30_000 })
  await expect(button).toBeDisabled()
  await shot(page, testInfo, 'pay-insufficient')

  // Back on the request, decline it (two taps).
  await page.getByLabel(tr.common.back).first().click()
  const card = page.getByTestId('paykit-request')
  await expect(card).toHaveAttribute('data-status', 'open')
  await page.getByTestId('paykit-incoming-decline').click()
  await expect(page.getByTestId('paykit-incoming-decline')).toHaveText('Confirm decline')
  await page.getByTestId('paykit-incoming-decline').click()
  await expect(card).toHaveAttribute('data-status', 'rejected', { timeout: 30_000 })
  await expect(page.getByTestId('paykit-request-status')).toHaveText('Declined')
  await expect(page.getByTestId('paykit-incoming-approve')).toHaveCount(0)
  await shot(page, testInfo, 'pay-declined')
})
