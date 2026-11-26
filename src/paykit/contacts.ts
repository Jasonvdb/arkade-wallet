import { pubkyUri } from './identity'

const Z32 = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/
// 52 z-base-32 characters carry 260 bits: the last character holds 1 bit of the key and 4 zero bits.
const Z32_LAST = /[yo]$/

/**
 * The Pubky ID (z-base-32, no prefix) in `text`, as people paste it: `pubky<id>`, `pk:<id>` or the bare
 * 52 characters, in any case and with spaces around it. `undefined` when it is not a Pubky ID.
 */
export const parsePubkyId = (text: string): string | undefined => {
  const trimmed = text.trim().toLowerCase()
  const bare = trimmed.startsWith('pubky')
    ? trimmed.slice('pubky'.length)
    : trimmed.startsWith('pk:')
      ? trimmed.slice('pk:'.length)
      : trimmed
  return Z32.test(bare) && Z32_LAST.test(bare) ? bare : undefined
}

/** How a Pubky contact is saved in the wallet's contacts: its Pubky ID with the `pubky` prefix. */
export const pubkyContactAddress = (pubkyId: string): string => pubkyUri(pubkyId)

/** The Pubky ID of a saved contact's address, when the contact is a Pubky contact. */
export const pubkyIdOfContact = (address: string): string | undefined =>
  address.startsWith('pubky') ? parsePubkyId(address) : undefined

/** Whether `address` is a Pubky ID the contacts list can save. */
export const isPubkyContact = (address: string): boolean => parsePubkyId(address) !== undefined

/** Whether two contacts' Pubky IDs are the same identity. */
export const samePubky = (a: string, b: string): boolean => {
  const left = parsePubkyId(a)
  return left !== undefined && left === parsePubkyId(b)
}

/**
 * Whether a contact admits this wallet back. `pending`: this wallet allowed the contact, and waits for the
 * contact to add this wallet too; `connected`: both sides allowed each other.
 */
export type Connection = 'pending' | 'connected'

/** What this wallet remembers per Pubky contact (localStorage, per own identity). */
export interface ConnectionRecord {
  /** The admission probe's message ID (`probeAdmission`); its delivery turns `accepted` once admitted. */
  probeMsgId?: string
  /** When the contact was first seen to admit this wallet. Connected stays connected. */
  connectedAtMs?: number
}

const connectionsKey = (ownId: string) => `paykit.connections.v1.${ownId}`

export const readConnections = (ownId: string): Record<string, ConnectionRecord> => {
  try {
    const stored = JSON.parse(localStorage.getItem(connectionsKey(ownId)) ?? '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    return {}
  }
}

export const writeConnections = (ownId: string, records: Record<string, ConnectionRecord>): void => {
  try {
    localStorage.setItem(connectionsKey(ownId), JSON.stringify(records))
  } catch {
    // Storage full or blocked: the probe runs again on the next start.
  }
}

/**
 * Whole satoshis of a decimal BTC amount (`"0.00012000"`), with string arithmetic so no float rounds it.
 * `undefined` for anything but a plain non-negative decimal with at most 8 fraction digits.
 */
export const btcToSats = (value: string): number | undefined => {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim())
  if (!match) return undefined
  const sats = BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? '').padEnd(8, '0'))
  return sats <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sats) : undefined
}
