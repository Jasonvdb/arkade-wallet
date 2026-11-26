import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createPrivateKey, createPublicKey } from 'crypto'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { mnemonicToSeedSync } from '@scure/bip39'
import type { Page, TestInfo } from '@playwright/test'
import {
  createWallet,
  expect,
  isDesktop,
  navigateHome,
  navigateToSettings,
  pickReceiveFormat,
  readClipboard,
} from '../utils'
import { translations } from '../../../lib/i18n'

const tr = translations.en

export const FAKE_HOMESERVER = process.env.PAYKIT_E2E_FAKE_HOMESERVER ?? 'http://127.0.0.1:18590'
export const DISPATCH_ORIGIN = 'https://localhost:18580'
export const ESPLORA = process.env.PAYKIT_E2E_ESPLORA ?? 'http://127.0.0.1:3000/api'
export const IDENTITY_PATH = '/pub/pubky-dispatch/v1/identity.json'

const Z32 = 'ybndrfg8ejkmcpqxot1uwisza345h769'

/** z-base-32, written here independently of the app's own encoder. */
export function zbase32(bytes: Uint8Array): string {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += Z32[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) out += Z32[(buffer << (5 - bits)) & 31]
  return out
}

/** The Pubky ID of a recovery phrase: Ed25519 public key of the first 32 bytes of the BIP39 seed (Node crypto). */
export function pubkyIdOfMnemonic(mnemonic: string): string {
  const secret = Buffer.from(mnemonicToSeedSync(mnemonic).subarray(0, 32))
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), secret])
  const key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' })
  return zbase32(spki.subarray(-32))
}

/** A file on the fake Homeserver, or null when it is absent. */
export async function homeserverFile(identity: string, path: string): Promise<Buffer | null> {
  const answer = await fetch(`${FAKE_HOMESERVER}/${identity}${path}`)
  if (answer.status === 404) return null
  if (!answer.ok) throw new Error(`the fake Homeserver answered ${answer.status} for ${path}`)
  return Buffer.from(await answer.arrayBuffer())
}

/** The JSON body of a signed identity.json (its `body` is base64url JSON). */
export function identityDocument(doc: Buffer): {
  identity: string
  inbox?: { url?: string }
  apps?: { app_id: string }[]
} {
  return JSON.parse(Buffer.from(JSON.parse(doc.toString('utf8')).body, 'base64url').toString('utf8'))
}

/** Reads the wallet's recovery phrase from Settings > Backup (a passwordless wallet). */
export async function readRecoveryPhrase(page: Page): Promise<string> {
  await navigateToSettings(page)
  await page.getByText(tr.settings.backup, { exact: true }).click()
  await page.getByText(tr.backup.viewRecoveryPhrase).click()
  await page.getByText(tr.backup.confirm).click()
  const phrase = (await page.getByTestId('private-key').textContent())?.trim() ?? ''
  await page.getByLabel(tr.common.back).first().click()
  await page.getByTestId('header-title-settings').waitFor({ state: 'visible' })
  return phrase
}

/** Opens Settings > Pubky identity. */
export async function openPubkyIdentity(page: Page): Promise<void> {
  await navigateToSettings(page)
  await page.getByText(tr.settings.pubkyIdentity, { exact: true }).click()
  await page.getByTestId('paykit-status').waitFor({ state: 'visible' })
}

/** The `arkdemo` script of the demo infra: ARKDEMO, or the demo folder next to this checkout. */
export function arkdemo(...args: string[]): string {
  const candidates = [process.env.ARKDEMO, resolve('../demo/infra/arkdemo'), resolve('../../demo/infra/arkdemo')]
  const script = candidates.find((path) => path && existsSync(path))
  if (!script) throw new Error('set ARKDEMO to the demo infra script (demo/infra/arkdemo)')
  return execFileSync(script, args, { encoding: 'utf8' })
}

/** Saves a screenshot under PAYKIT_SHOTS_DIR (when set) as `<name>-<project>.png`. */
export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const dir = process.env.PAYKIT_SHOTS_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const project = testInfo.project.name.toLowerCase().replace(/\s+/g, '-')
  await page.screenshot({ path: join(dir, `${name}-${project}.png`) })
}

/** Opens the contacts list: the sidebar on desktop, Settings > Contacts on mobile. */
export async function openContacts(page: Page): Promise<void> {
  if (isDesktop(page)) await page.getByTestId('desktop-nav-contacts').click()
  else {
    await navigateToSettings(page)
    await page.getByRole('button', { name: tr.contacts.title, exact: true }).click()
  }
  // Back from a Paykit screen, the contacts screen shows that contact's page: go to the list.
  const list = page.getByTestId('contacts-new')
  await list.or(page.getByTestId('contact-back')).first().waitFor({ state: 'visible' })
  if (!(await list.isVisible())) await page.getByTestId('contact-back').click()
  await list.waitFor({ state: 'visible' })
}

/** The wallet's boarding address (Receive > Other formats > Bitcoin address), which `arkdemo fund` pays. */
export async function boardingAddress(page: Page): Promise<string> {
  await navigateHome(page)
  await page.getByTestId('home-action-receive').click()
  await pickReceiveFormat(page, 'Bitcoin address')
  await page.getByTestId('btc-address-copy').click()
  const address = (await readClipboard(page)).trim()
  if (!/^bcrt1p[02-9ac-hj-np-z]{58}$/.test(address)) throw new Error(`not a boarding address: ${address}`)
  await navigateHome(page)
  return address
}

/**
 * Saves `peerId` as a contact named `name` from the contacts screen, as a user does, and waits until the
 * sheet has closed.
 */
export async function addPubkyContact(page: Page, name: string, peerId: string): Promise<void> {
  await page.getByTestId('contacts-new').click()
  await page.getByTestId('contact-address').click()
  await page.getByTestId('contact-name').click()
  await page.waitForTimeout(400)
  await page.getByTestId('contact-name').fill(name)
  await page.getByTestId('contact-address').fill(`pubky${peerId}`)
  await page.getByTestId('contact-save').click()
  await page.getByTestId('contact-save').waitFor({ state: 'hidden' })
}

/** A new wallet with Paykit ready, which `peer` allows to send it requests. Returns the wallet's Pubky ID. */
export async function connectedWallet(page: Page, peer: Peer): Promise<string> {
  await createWallet(page)
  const walletId = pubkyIdOfMnemonic(await readRecoveryPhrase(page))
  await openPubkyIdentity(page)
  await expect(page.getByTestId('paykit-status')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 })
  peer.must('allow', 'allowed', walletId)
  return walletId
}

/** Saves `peer` as the contact `name` and waits until it is connected both ways (left on the contact's page). */
export async function addAndConnect(page: Page, peer: Peer, name: string): Promise<void> {
  await openContacts(page)
  await addPubkyContact(page, name, peer.id)
  await expect(page.getByTestId('paykit-contact-status')).toHaveAttribute('data-connection', 'connected', {
    timeout: 30_000,
  })
}

/** The whole sats of the wallet's main balance as shown on the home screen (sats or BTC display). */
export async function mainBalanceSats(page: Page): Promise<number> {
  await navigateHome(page)
  const text = ((await page.getByTestId('main-balance').first().textContent()) ?? '').replace(/[,\s]/g, '')
  const number = /[\d.]+/.exec(text)?.[0] ?? '0'
  return number.includes('.') ? Math.round(Number(number) * 100_000_000) : Number(number)
}

/** The sum of a transaction's outputs to `address`, in sats, from the local esplora. */
export async function satsPaidTo(txid: string, address: string): Promise<number> {
  const answer = await fetch(`${ESPLORA}/tx/${txid}`)
  if (!answer.ok) throw new Error(`esplora answered ${answer.status} for ${txid}`)
  const tx = (await answer.json()) as { vout: { scriptpubkey_address?: string; value: number }[] }
  return tx.vout.filter((out) => out.scriptpubkey_address === address).reduce((sum, out) => sum + out.value, 0)
}

/** One event line of the native peer (`paykit-peer` README, "Events"). */
export type PeerEvent = { event: string; [field: string]: unknown }

/**
 * A native Paykit peer (`paykit-peer`) with a fresh identity in its own state folder, driven by one-shot
 * commands. The binary is PAYKIT_PEER, or `.build/bin/paykit-peer` of the demo folder; the state folders
 * live under PAYKIT_PEER_RUN (default `.build/run/wallet-peer`).
 */
export class Peer {
  readonly id: string
  private constructor(
    private readonly binary: string,
    private readonly state: string,
  ) {
    this.id = String(this.must('init', 'ready').identity)
  }

  static create(name: string): Peer {
    const demo = [resolve('../..'), resolve('../../..')].find((dir) => existsSync(join(dir, '.build/bin/paykit-peer')))
    const binary = process.env.PAYKIT_PEER ?? (demo ? join(demo, '.build/bin/paykit-peer') : 'paykit-peer')
    const root =
      process.env.PAYKIT_PEER_RUN ?? (demo ? join(demo, '.build/run/wallet-peer') : resolve('test-results/peer'))
    const state = join(root, `${name}-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    rmSync(state, { recursive: true, force: true })
    return new Peer(binary, state)
  }

  /** Runs one command and returns its event lines. */
  run(...args: string[]): PeerEvent[] {
    const out = execFileSync(this.binary, ['--state', this.state, ...args], { encoding: 'utf8', timeout: 120_000 })
    return out
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line) as PeerEvent)
  }

  /**
   * Starts `run` with `flags` (such as `--auto-confirm`) in the background, collecting its events, until
   * `stop()`. One-shot commands must not run meanwhile: they share the state folder.
   */
  start(...flags: string[]): PeerRun {
    return new PeerRun(spawn(this.binary, ['--state', this.state, 'run', ...flags]))
  }

  /** Runs one command and returns its event named `event`; throws when it did not print one. */
  must(command: string, event: string, ...args: string[]): PeerEvent {
    const events = this.run(command, ...args)
    const found = events.find((line) => line.event === event)
    if (!found) throw new Error(`paykit-peer ${command} printed no ${event} event: ${JSON.stringify(events)}`)
    return found
  }
}

/** A peer's `run` in the background: its events, as they come. */
export class PeerRun {
  readonly events: PeerEvent[] = []
  private buffer = ''
  private log = ''

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim().startsWith('{')) continue
        try {
          this.events.push(JSON.parse(line) as PeerEvent)
        } catch {
          // Not an event line.
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.log = (this.log + chunk).slice(-20_000)
    })
  }

  /** Waits for an event named `event` whose fields include `fields`. */
  async waitFor(event: string, fields: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<PeerEvent> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const found = this.events.find(
        (line) => line.event === event && Object.entries(fields).every(([key, value]) => line[key] === value),
      )
      if (found) return found
      if (this.child.exitCode !== null) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(
      `paykit-peer printed no ${event} ${JSON.stringify(fields)}; events: ${JSON.stringify(this.events.slice(-20))}\n${this.log.slice(-4000)}`,
    )
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null) return
    const exited = new Promise((resolve) => this.child.once('exit', resolve))
    this.child.stdin.end('quit\n')
    const timer = setTimeout(() => this.child.kill('SIGTERM'), 5_000)
    await exited
    clearTimeout(timer)
  }
}
