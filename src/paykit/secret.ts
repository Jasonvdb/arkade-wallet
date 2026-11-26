import { identitySecretFromMnemonic } from './identity'

/**
 * The unlocked wallet's Pubky identity secret, held in memory only. The wallet provider sets it where it
 * initialises a mnemonic wallet and clears it on lock and reset; the Paykit provider reads it. It is never
 * written to storage or logged: the only copy that outlives the page is what the engine itself keeps.
 */
export type IdentitySecretState =
  | { kind: 'none' } // no wallet unlocked yet
  | { kind: 'unsupported' } // a private-key (nsec) wallet: no recovery phrase to derive from
  | { kind: 'ready'; secret: Uint8Array }

let state: IdentitySecretState = { kind: 'none' }
let generation = 0
const listeners = new Set<() => void>()

const publish = (next: IdentitySecretState) => {
  if (state.kind === 'ready') state.secret.fill(0)
  state = next
  for (const listener of listeners) listener()
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

/** Derives and holds the identity secret of a mnemonic wallet that has just been initialised. */
export const setPaykitMnemonic = async (mnemonic: string): Promise<void> => {
  const run = ++generation
  const secret = await identitySecretFromMnemonic(mnemonic)
  // A lock or another wallet since this call started wins.
  // So does the same wallet initialised again: the running engine keeps going.
  if (run !== generation || (state.kind === 'ready' && sameBytes(state.secret, secret))) {
    secret.fill(0)
    return
  }
  publish({ kind: 'ready', secret })
}

/** Marks the unlocked wallet as one Paykit cannot derive an identity for. */
export const setPaykitUnsupported = (): void => {
  generation++
  publish({ kind: 'unsupported' })
}

/** Forgets the identity secret (wallet locked or reset). */
export const clearPaykitSecret = (): void => {
  generation++
  if (state.kind === 'none') return
  publish({ kind: 'none' })
}

export const subscribeIdentitySecret = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const identitySecretState = (): IdentitySecretState => state
