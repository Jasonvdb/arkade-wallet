import type { Page } from '@playwright/test'
import { test, expect, createWallet, waitForWalletPage } from '../utils'
import { Peer, openContacts, openPubkyIdentity, pubkyIdOfMnemonic, readRecoveryPhrase, shot } from './helpers'

const NOTE = "Dinner at Lucia's"

/**
 * Opens the new-contact sheet and waits for it to settle: the sheet focuses its first field when its
 * animation ends, which would otherwise move text typed earlier into the name field.
 */
async function openNewContact(page: Page) {
  await page.getByTestId('contacts-new').click()
  await page.getByTestId('contact-address').click()
  await page.getByTestId('contact-name').click()
  await page.waitForTimeout(400)
}
const SATS = 12_500

test('adds a Pubky contact, connects both ways and lists its payment request', async ({ page }, testInfo) => {
  test.slow()
  const peer = Peer.create(`w2-${testInfo.project.name.toLowerCase().replace(/\s+/g, '-')}`)

  await createWallet(page)
  const walletId = pubkyIdOfMnemonic(await readRecoveryPhrase(page))
  await openPubkyIdentity(page)
  await expect(page.getByTestId('paykit-status')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })

  // An empty contacts screen.
  await openContacts(page)
  await shot(page, testInfo, 'contacts-empty')

  // Failure paths: not a Pubky ID or any address, and the wallet's own Pubky ID.
  await openNewContact(page)
  await page.getByTestId('contact-name').fill('Alice')
  await page.getByTestId('contact-address').fill('pubky-not-an-identity')
  await page.getByTestId('contact-save').click()
  await expect(page.getByText('Enter a valid address')).toBeVisible()
  await page.getByTestId('contact-address').fill(`pubky${walletId}`)
  await page.getByTestId('contact-save').click()
  await expect(page.getByText('This is your own Pubky ID')).toBeVisible()
  await page.getByText('Cancel', { exact: true }).click()
  await expect(page.getByTestId('contact-save')).toBeHidden()

  // Add the peer by its Pubky ID, pasted with the prefix, under a name the user gives.
  await openNewContact(page)
  await page.getByTestId('contact-name').fill('Alice')
  await page.getByTestId('contact-address').fill(`pubky${peer.id}`)
  await shot(page, testInfo, 'contact-add')
  await page.getByTestId('contact-save').click()
  await expect(page.getByTestId('contact-save')).toBeHidden()

  // The wallet allowed the peer; it waits until the peer adds the wallet back.
  const status = page.getByTestId('paykit-contact-status')
  await expect(status).toHaveAttribute('data-pubky', peer.id)
  await expect(status).toHaveAttribute('data-connection', 'pending')
  await expect(status).toContainText('Waiting for Alice to add you')
  await expect(page.getByTestId('paykit-incoming-empty')).toContainText('No payment requests from Alice yet.')
  await shot(page, testInfo, 'contact-pending')

  // The peer allows the wallet: the contact turns connected.
  expect(peer.must('allow', 'allowed', walletId).id).toBe(walletId)
  await expect(status).toHaveAttribute('data-connection', 'connected', { timeout: 30_000 })
  await expect(status).toContainText('Connected')
  await shot(page, testInfo, 'contact-connected')

  // The peer requests money: it shows in the wallet's incoming requests with its amount and note.
  const sent = peer.must('request', 'request_sent', walletId, String(SATS), '--reference', NOTE)
  expect(String(sent.delivery).toLowerCase()).toBe('accepted')
  const row = page.getByTestId('paykit-incoming-row').and(page.locator(`[data-request-hash="${sent.request_hash}"]`))
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row).toHaveAttribute('data-payee', peer.id)
  await expect(row).toHaveAttribute('data-sats', String(SATS))
  await expect(row).toHaveAttribute('data-amount', '0.00012500')
  await expect(row).toHaveAttribute('data-note', NOTE)
  await expect(row).toHaveAttribute('data-status', 'open')
  // On the contact's page the section names the contact; the row's title is the note, not the name again.
  await expect(row).toContainText(NOTE)
  await expect(row).not.toContainText('Alice')
  await expect(page.getByTestId('paykit-incoming').getByText('Requests from Alice')).toBeVisible()
  await shot(page, testInfo, 'contact-request')

  // The contacts list: the contact, connected, and the request above it.
  await page.getByTestId('contact-back').click()
  const contactRow = page.getByTestId('paykit-contact-row').and(page.locator(`[data-pubky="${peer.id}"]`))
  await expect(contactRow).toHaveAttribute('data-connection', 'connected')
  await expect(page.getByTestId('paykit-incoming-row')).toHaveCount(1)
  await shot(page, testInfo, 'contacts-list')

  // After a reload the contact, its connection and the request are still there.
  await page.reload()
  await waitForWalletPage(page)
  await openContacts(page)
  await expect(contactRow).toHaveAttribute('data-connection', 'connected')
  await expect(contactRow).toContainText('Alice')
  const reloadedRow = page
    .getByTestId('paykit-incoming-row')
    .and(page.locator(`[data-request-hash="${sent.request_hash}"]`))
  await expect(reloadedRow).toBeVisible({ timeout: 60_000 })
  await expect(reloadedRow).toHaveAttribute('data-sats', String(SATS))
  await expect(reloadedRow).toHaveAttribute('data-note', NOTE)
  await shot(page, testInfo, 'contacts-reloaded')
})
