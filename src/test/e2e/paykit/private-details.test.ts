import { test, expect } from '../utils'
import {
  Peer,
  addAndConnect,
  arkdemo,
  boardingAddress,
  connectedWallet,
  openContact,
  openRequest,
  satsPaidTo,
  shot,
  waitUntilSignable,
} from './helpers'

const projectSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

const PAY_SATS = 9_000
const PAY_NOTE = 'Coffee beans'
const ASK_SATS = 11_000
const ASK_NOTE = 'Book club'

test('shares private payment details with a contact and pays requests to them both ways', async ({
  page,
}, testInfo) => {
  test.setTimeout(480_000)
  const peer = Peer.create(`w5-${projectSlug(testInfo.project.name)}`)
  peer.must('fund', 'funded', '200000')
  const walletId = await connectedWallet(page, peer)
  const boarding = await boardingAddress(page)

  // Funds for paying the contact: they board while the details are exchanged.
  arkdemo('fund', boarding, '0.001')
  await expect(page.getByTestId('main-balance').first()).toHaveText(/100,000|0\.001/, { timeout: 60_000 })

  // The peer pays every request it holds, and confirms every payment it receives.
  const run = peer.start('--auto-pay', '--auto-confirm')
  try {
    // 1. Once connected, the wallet shares its details: its boarding address as a Taproot endpoint.
    await addAndConnect(page, peer, 'Alice')
    const mine = page.getByTestId('paykit-share-details')
    await expect(mine).toHaveAttribute('data-state', 'shared', { timeout: 30_000 })
    await expect(mine).toContainText('Shared with Alice')
    const received = await run.waitFor('list_received', { from: walletId }, 60_000)
    const endpoints = received.endpoints as { endpoint_id: string; address: string }[]
    expect(endpoints).toHaveLength(1)
    expect(endpoints[0].endpoint_id).toBe('btc-regtest-p2tr')
    expect(endpoints[0].address).toBe(boarding)
    console.log(`peer: received the wallet's list, ${endpoints[0].endpoint_id} ${endpoints[0].address}`)
    const theirs = page.getByTestId('paykit-contact-details')
    await expect(theirs).toHaveAttribute('data-state', 'waiting')
    await expect(page.getByText('Copied to clipboard')).toHaveCount(0, { timeout: 10_000 })
    await shot(page, testInfo, 'details-shared')

    // 2. The peer shares its details; the contact's page shows them in words.
    run.send(`publish-list ${walletId}`)
    const published = await run.waitFor('list_published', { to: walletId })
    const peerAddress = String(published.address)
    expect(peerAddress).toMatch(/^bcrt1q/)
    await expect(theirs).toHaveAttribute('data-state', 'received', { timeout: 30_000 })
    await expect(theirs).toHaveAttribute('data-address', peerAddress)
    await expect(theirs).toHaveAttribute('data-endpoint', 'btc-regtest-p2wpkh')
    await expect(page.getByTestId('paykit-contact-details-method')).toContainText('Bitcoin address (SegWit)')
    await expect(page.getByTestId('paykit-contact-details-address')).toContainText(peerAddress.slice(0, 10))
    await expect(page.getByTestId('paykit-contact-details-status')).toHaveText('Shared with you')
    await shot(page, testInfo, 'details-both')

    // 3. The peer asks for 9,000 sats to its private details; the wallet pays its list address.
    run.send(`request ${walletId} ${PAY_SATS} --any --reference "${PAY_NOTE}"`)
    const asked = await run.waitFor('request_sent', { reference: PAY_NOTE })
    expect(asked.destination).toBe('any')
    expect(asked.address).toBeNull()
    const payHash = String(asked.request_hash)
    await openRequest(page, payHash)
    const request = page.getByTestId('paykit-request')
    await expect(request).toHaveAttribute('data-destination', 'any')
    await expect(request).toHaveAttribute('data-pay-to', peerAddress)
    await expect(page.getByTestId('paykit-request-private')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('paykit-request-note')).toHaveText(PAY_NOTE)
    await shot(page, testInfo, 'any-request')

    await page.getByTestId('paykit-incoming-approve').click()
    await expect(page.getByTestId('paykit-pay-context')).toContainText('Payment request from Alice')
    await waitUntilSignable(page)
    await expect(page.getByTestId('primary-amount')).toContainText(/9,000|0\.00009/)
    await shot(page, testInfo, 'any-confirm')
    await page.getByTestId('paykit-pay-confirm').click()

    await expect(request).toHaveAttribute('data-status', 'paid', { timeout: 200_000 })
    const payTxid = (await request.getAttribute('data-txid')) ?? ''
    expect(payTxid).toMatch(/^[0-9a-f]{64}$/)
    const paidToPeer = await satsPaidTo(payTxid, peerAddress)
    expect(paidToPeer).toBeGreaterThanOrEqual(PAY_SATS)
    console.log(`esplora: ${payTxid} pays ${paidToPeer} sats to ${peerAddress}`)
    const verified = await run.waitFor('verified', { request_hash: payHash })
    expect(verified.txid).toBe(payTxid)
    const confirmed = await run.waitFor('confirmed', { request_hash: payHash })
    console.log(`peer: verified ${verified.sats_received} sats, receipt ${confirmed.receipt_msg_id}`)
    await expect(request).toHaveAttribute('data-receipt', 'received', { timeout: 60_000 })
    await expect(page.getByTestId('paykit-request-receipt')).toContainText('Receipt from Alice')
    await shot(page, testInfo, 'any-paid')

    // 4. The wallet asks for 11,000 sats to its private details; the peer pays the wallet's list address.
    await page.getByTestId('paykit-request-done').click()
    await openContact(page, peer.id)
    await page.getByTestId('paykit-request-contact').click()
    const usePrivate = page.getByTestId('paykit-request-any')
    await expect(usePrivate).toHaveAttribute('aria-checked', 'false')
    await usePrivate.click()
    await expect(usePrivate).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('paykit-request-amount').locator('input').fill(String(ASK_SATS))
    await page.getByTestId('paykit-request-memo').fill(ASK_NOTE)
    await expect(page.getByTestId('paykit-request-hint')).toContainText('private payment details')
    await shot(page, testInfo, 'any-form')
    await page.getByTestId('paykit-request-send').click()

    const sent = page.getByTestId('paykit-sent-request')
    await expect(sent).toBeVisible({ timeout: 30_000 })
    await expect(sent).toHaveAttribute('data-destination', 'any')
    const askHash = (await sent.getAttribute('data-request-hash')) ?? ''
    expect(askHash).toMatch(/^[0-9a-f]{64}$/)
    await shot(page, testInfo, 'any-sent')

    const got = await run.waitFor('request_received', { request_hash: askHash })
    expect(got.from).toBe(walletId)
    expect(Number(got.sats)).toBe(ASK_SATS)
    const paid = await run.waitFor('paid', { request_hash: askHash })
    expect(paid.endpoint_id).toBe('btc-regtest-p2tr')
    expect(paid.address).toBe(boarding)
    const askTxid = String(paid.txid)

    await expect(sent).toHaveAttribute('data-status', 'receipted', { timeout: 60_000 })
    await expect(sent).toHaveAttribute('data-txid', askTxid)
    await expect(page.getByTestId('paykit-sent-status')).toHaveText('Received')
    await expect(page.getByTestId('paykit-sent-state')).toHaveAttribute('data-state', 'received')
    const receipt = await run.waitFor('receipt_received', { request_hash: askHash }, 60_000)
    expect(receipt.txid).toBe(askTxid)
    const paidToWallet = await satsPaidTo(askTxid, boarding)
    expect(paidToWallet).toBeGreaterThanOrEqual(ASK_SATS)
    console.log(`esplora: ${askTxid} pays ${paidToWallet} sats to ${boarding}`)
    console.log(`peer: paid ${paid.sats} sats to the wallet's details, receipt ${receipt.msg_id}`)
    await shot(page, testInfo, 'any-received')

    // The contact's page: both details shared, the request received and the one paid.
    await page.getByTestId('paykit-sent-done').click()
    await expect(page.getByTestId('paykit-private-details')).toBeVisible()
    const row = page.getByTestId('paykit-activity-row').and(page.locator(`[data-request-hash="${askHash}"]`))
    await expect(row).toHaveAttribute('data-status', 'receipted')
    await shot(page, testInfo, 'details-contact-final')
  } finally {
    await run.stop()
  }
})
