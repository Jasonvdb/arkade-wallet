import type { Address, Path } from '@synonymdev/pubky'
import type { PaykitConfig } from './config'

/**
 * The engine's Homeserver, on the page. `get` reads any identity's file (`null` when absent); `put` and
 * `delete` write the wallet's own identity and resolve once the write is durable. Paths are absolute
 * (`/pub/...`, `/priv/...`). The engine refuses writes for any other identity before they get here.
 */
export interface PageHomeserver {
  get(identity: string, path: string): Promise<Uint8Array | null>
  put(path: string, bytes: Uint8Array): Promise<void>
  delete(path: string): Promise<void>
  /** Releases what the adapter holds (a session). */
  close(): void
}

/**
 * The local fake Homeserver (`GET/PUT/DELETE {base}/{identityZ32}{path}`), for tests and local runs.
 * It has no auth and stores `/priv` files readable by anyone: never point it at a real identity's data.
 */
export const fakeHomeserver = (baseUrl: string, ownIdentity: string): PageHomeserver => {
  const url = (identity: string, path: string) => `${baseUrl.replace(/\/$/, '')}/${identity}${path}`
  const expect = async (answer: Response, what: string) => {
    if (!answer.ok) throw new Error(`the Homeserver answered ${answer.status} to ${what}`)
  }
  return {
    async get(identity, path) {
      const answer = await fetch(url(identity, path), { cache: 'no-store' })
      if (answer.status === 404) return null
      await expect(answer, 'a read')
      return new Uint8Array(await answer.arrayBuffer())
    },
    async put(path, bytes) {
      // A fresh copy: fetch must not see the buffer change under it.
      await expect(await fetch(url(ownIdentity, path), { method: 'PUT', body: bytes.slice() }), 'a write')
    },
    async delete(path) {
      await expect(await fetch(url(ownIdentity, path), { method: 'DELETE' }), 'a delete')
    },
    close() {},
  }
}

type PubkyModule = typeof import('@synonymdev/pubky')
type PubkySession = Awaited<ReturnType<ReturnType<InstanceType<PubkyModule['Pubky']>['signer']>['signin']>>

const statusOf = (error: unknown): number | undefined =>
  (error as { data?: { statusCode?: number } } | undefined)?.data?.statusCode

/**
 * Pubky staging through `@synonymdev/pubky` (loaded on first use, so a fake run never downloads it).
 * The wallet signs in with the identity key. The first time an identity is seen, it signs up with the
 * configured single-use token. Reads of the wallet's own `/priv` files go through the session; every
 * other read is a public read.
 */
export const stagingHomeserver = (
  config: Pick<PaykitConfig, 'stagingHomeserver' | 'stagingSignupToken' | 'clientId'>,
  secret: Uint8Array,
  ownIdentity: string,
): PageHomeserver => {
  // The adapter keeps its own copy: the caller may wipe its buffer when the wallet locks.
  const key = secret.slice()
  let session: Promise<{ pubky: InstanceType<PubkyModule['Pubky']>; session: PubkySession }> | undefined

  const open = async () => {
    const sdk: PubkyModule = await import('@synonymdev/pubky')
    const pubky = new sdk.Pubky()
    const signer = pubky.signer(sdk.Keypair.fromSecret(key))
    try {
      return { pubky, session: await signer.signin(config.clientId) }
    } catch (error) {
      // A returning identity signs in; a new one signs up first, which needs a token.
      if (!config.stagingSignupToken) throw error
      await signer.signup(sdk.PublicKey.from(config.stagingHomeserver), config.stagingSignupToken)
      return { pubky, session: await signer.signin(config.clientId) }
    }
  }

  const ready = () => {
    // A failed sign-in is tried again on the next call.
    session ??= open().catch((error) => {
      session = undefined
      throw error
    })
    return session
  }

  const absentAsNull = async (read: () => Promise<Uint8Array>): Promise<Uint8Array | null> => {
    try {
      return await read()
    } catch (error) {
      if (statusOf(error) === 404) return null
      throw error
    }
  }

  return {
    async get(identity, path) {
      const { pubky, session: own } = await ready()
      if (identity === ownIdentity) return absentAsNull(() => own.storage.getBytes(path as Path))
      return absentAsNull(() => pubky.publicStorage.getBytes(`pubky${identity}${path}` as Address))
    },
    async put(path, bytes) {
      const { session: own } = await ready()
      await own.storage.putBytes(path as Path, bytes.slice())
    },
    async delete(path) {
      const { session: own } = await ready()
      try {
        await own.storage.delete(path as Path)
      } catch (error) {
        if (statusOf(error) !== 404) throw error
      }
    },
    close() {
      key.fill(0)
      session = undefined
    },
  }
}

/** The Homeserver the configuration names, for the wallet's own identity. */
export const createHomeserver = (config: PaykitConfig, secret: Uint8Array, ownIdentity: string): PageHomeserver =>
  config.homeserver === 'staging'
    ? stagingHomeserver(config, secret, ownIdentity)
    : fakeHomeserver(config.fakeHomeserverUrl, ownIdentity)
