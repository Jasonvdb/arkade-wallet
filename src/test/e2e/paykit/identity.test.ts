import { createHash } from 'crypto'
import {
  test,
  expect,
  createWallet,
  navigateHome,
  navigateToSettings,
  pickReceiveFormat,
  readClipboard,
  waitForWalletPage,
} from '../utils'
import {
  DISPATCH_ORIGIN,
  IDENTITY_PATH,
  arkdemo,
  homeserverFile,
  identityDocument,
  openPubkyIdentity,
  pubkyIdOfMnemonic,
  readRecoveryPhrase,
  shot,
  zbase32,
} from './helpers'

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

test('shows the Pubky ID of the recovery phrase, enrols once and keeps it across a reload', async ({
  page,
}, testInfo) => {
  await createWallet(page)
  const expected = pubkyIdOfMnemonic(await readRecoveryPhrase(page))

  // First start: the engine enrols the identity at the local Dispatch and joins the app.
  await openPubkyIdentity(page)
  const status = page.getByTestId('paykit-status')
  await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  await expect(status).toHaveAttribute('data-enrolment', 'new')
  await expect(page.getByTestId('paykit-identity')).toHaveAttribute('data-pubky', expected)
  await expect(page.getByTestId('paykit-identity')).toContainText(`pubky${expected.slice(0, 9)}`)
  const appId = (await status.getAttribute('data-app-id')) ?? ''

  // The signer published identity.json on the fake Homeserver, naming the Dispatch and only this app.
  const doc = await homeserverFile(expected, IDENTITY_PATH)
  expect(doc, 'identity.json on the fake Homeserver').not.toBeNull()
  const body = identityDocument(doc!)
  expect(body.identity).toBe(expected)
  expect(body.inbox?.url).toBe(DISPATCH_ORIGIN)
  expect(body.apps?.map((app) => app.app_id)).toEqual([zbase32(Buffer.from(appId, 'base64url'))])
  const docHash = sha256(doc!)

  await shot(page, testInfo, 'identity')
  await page.getByTestId('paykit-identity-copy').click()
  expect(await readClipboard(page)).toBe(`pubky${expected}`)

  // A reload reopens the engine from its stores: the same ID and app, no second enrolment.
  await page.reload()
  await waitForWalletPage(page)
  await openPubkyIdentity(page)
  await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  await expect(status).toHaveAttribute('data-enrolment', 'loaded')
  await expect(status).toHaveAttribute('data-app-id', appId)
  await expect(page.getByTestId('paykit-identity')).toHaveAttribute('data-pubky', expected)
  expect(sha256((await homeserverFile(expected, IDENTITY_PATH))!), 'identity.json is unchanged').toBe(docHash)
  await shot(page, testInfo, 'identity-reloaded')

  // A crashed worker is replaced and the engine reopens from its stores.
  await page.evaluate(() =>
    (window as unknown as { __paykitDebug: { crashWorker: () => void } }).__paykitDebug.crashWorker(),
  )
  await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  await expect(status).toHaveAttribute('data-enrolment', 'loaded')
  await expect(page.getByTestId('paykit-identity')).toHaveAttribute('data-pubky', expected)
})

test('runs the engine in one tab only', async ({ page, context }, testInfo) => {
  await createWallet(page)
  await navigateToSettings(page)
  await shot(page, testInfo, 'settings-menu')
  await openPubkyIdentity(page)
  await expect(page.getByTestId('paykit-status')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  const id = await page.getByTestId('paykit-identity').getAttribute('data-pubky')

  const second = await context.newPage()
  await second.goto('/')
  await waitForWalletPage(second)
  await openPubkyIdentity(second)
  await expect(second.getByTestId('paykit-status')).toHaveAttribute('data-status', 'waiting', { timeout: 30_000 })
  await expect(second.getByText('Active in another tab').first()).toBeVisible()
  await shot(second, testInfo, 'identity-other-tab')

  // The first tab closes: the second one takes over with the same identity.
  await page.close()
  await expect(second.getByTestId('paykit-status')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  await expect(second.getByTestId('paykit-status')).toHaveAttribute('data-enrolment', 'loaded')
  await expect(second.getByTestId('paykit-identity')).toHaveAttribute('data-pubky', id!)
})

test('offers a retry when the Dispatch cannot be reached', async ({ page, context }, testInfo) => {
  // The worker's requests to the Dispatch fail until the route is removed.
  const dispatch = 'http://127.0.0.1:18580/**'
  await context.route(dispatch, (route) => route.abort('connectionrefused'))
  await createWallet(page)
  await openPubkyIdentity(page)
  const status = page.getByTestId('paykit-status')
  await expect(status).toHaveAttribute('data-status', 'error', { timeout: 90_000 })
  await expect(page.getByText('Pubky identity unavailable')).toBeVisible()
  await shot(page, testInfo, 'identity-error')

  await context.unroute(dispatch)
  await page.getByTestId('paykit-retry').click()
  await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  await expect(page.getByTestId('paykit-identity')).toHaveAttribute(
    'data-pubky',
    /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/,
  )
})

test('the wallet still receives on-chain with Paykit running', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'Desktop Chrome', 'one funding run is enough')
  await createWallet(page)
  await openPubkyIdentity(page)
  await expect(page.getByTestId('paykit-status')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })

  await navigateHome(page)
  await page.getByTestId('home-action-receive').click()
  await pickReceiveFormat(page, 'Bitcoin address')
  await page.getByTestId('btc-address-copy').click()
  const boarding = (await readClipboard(page)).trim()
  expect(boarding).toMatch(/^bcrt1p[02-9ac-hj-np-z]{58}$/)

  arkdemo('fund', boarding, '0.001')
  await navigateHome(page)
  await expect(page.getByTestId('main-balance').first()).toHaveText(/100,000|0\.001/, {
    timeout: 60_000,
  })
})
