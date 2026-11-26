import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hex } from '@scure/base'
import { mnemonicToSeedWebcrypto } from '@scure/bip39'

/**
 * The Pubky identity's 32-byte secret key: the first 32 bytes of the BIP39 seed (no passphrase), the
 * rule Bitkit uses, so the same recovery phrase gives the same Pubky ID in both wallets.
 *
 * Demo shortcut: the identity key lives in the browser, next to the wallet's own keys.
 */
export const identitySecretFromMnemonic = async (mnemonic: string): Promise<Uint8Array> => {
  const seed = await mnemonicToSeedWebcrypto(mnemonic)
  const secret = seed.slice(0, 32)
  seed.fill(0)
  return secret
}

const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769'

/** z-base-32, most significant bits first, without padding: how Pubky spells a public key. */
export const zbase32 = (bytes: Uint8Array): string => {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += Z32_ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) out += Z32_ALPHABET[(buffer << (5 - bits)) & 31]
  return out
}

/** The Pubky ID (z-base-32 Ed25519 public key, no prefix) of an identity secret. */
export const pubkyIdOf = (secret: Uint8Array): string => zbase32(ed25519.getPublicKey(secret))

/** A Pubky ID as people share it: with the `pubky` prefix. */
export const pubkyUri = (pubkyId: string): string => `pubky${pubkyId}`

/** A short, stable store name per identity, so a reset wallet with a new phrase gets fresh engine stores. */
export const storePrefixFor = (pubkyId: string): string =>
  `paykit-${hex.encode(sha256(new TextEncoder().encode(pubkyId))).slice(0, 16)}`

export const secretToHex = (secret: Uint8Array): string => hex.encode(secret)
