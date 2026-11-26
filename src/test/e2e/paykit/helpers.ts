import { execFileSync } from 'child_process'
import { createPrivateKey, createPublicKey } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { mnemonicToSeedSync } from '@scure/bip39'
import type { Page, TestInfo } from '@playwright/test'
import { navigateToSettings } from '../utils'
import { translations } from '../../../lib/i18n'

const tr = translations.en

export const FAKE_HOMESERVER = process.env.PAYKIT_E2E_FAKE_HOMESERVER ?? 'http://127.0.0.1:18590'
export const DISPATCH_ORIGIN = 'https://localhost:18580'
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
