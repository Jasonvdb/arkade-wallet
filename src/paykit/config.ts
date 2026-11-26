import { fromRuntimeEnv } from '../lib/constants'
import { isLocalOnly } from '../lib/localOnly'
import type { EndpointSupport } from './pkg/paykit_wasm'

/** Where the engine keeps the identity's files. `fake` is the local test server; `staging` is Pubky staging. */
export type HomeserverBackend = 'fake' | 'staging'

export interface PaykitConfig {
  /** Paykit runs only where this is set: by default on a local regtest run, never on a public host. */
  enabled: boolean
  /** The Dispatch origin requests are signed for. */
  dispatchOrigin: string
  /** The plain HTTP loopback listener the requests for a `https://localhost` origin go to. */
  dispatchListener?: string
  homeserver: HomeserverBackend
  /** The fake Homeserver's base URL (`GET/PUT/DELETE /{identityZ32}{path}`). */
  fakeHomeserverUrl: string
  /** The staging Homeserver's public key, z-base-32. */
  stagingHomeserver: string
  /** A single-use signup token for staging, needed only the first time an identity signs up. */
  stagingSignupToken?: string
  /** The client ID the app's authentication request and the staging session carry. */
  clientId: string
  /** The Payment Endpoints this wallet receives on and pays to. */
  endpoints: EndpointSupport[]
  /**
   * How long paying a request may take before the engine reports it as still paying. A collaborative exit
   * waits for the operator's next batch round, so this is well above one round.
   */
  payLimitMs: number
  /** The esplora API the rail checks a payer's proof against (`GET /tx/{txid}`). */
  esploraUrl: string
}

const env = (value: string | undefined): string | undefined => fromRuntimeEnv(value)?.trim() || undefined

const enabledFromEnv = (): boolean => {
  const flag = env(import.meta.env.VITE_PAYKIT_ENABLED)
  if (flag) return flag === 'true'
  return isLocalOnly()
}

const homeserverFromEnv = (): HomeserverBackend =>
  env(import.meta.env.VITE_PAYKIT_HOMESERVER) === 'staging' ? 'staging' : 'fake'

/** The regtest on-chain identifiers of the demo contract (CONTRACT.md, "Payment method"). */
export const BOARDING_ENDPOINT = 'btc-regtest-p2tr'
export const SEGWIT_ENDPOINT = 'btc-regtest-p2wpkh'
export const BTC_FRACTION_DIGITS = 8

export const paykitConfig: PaykitConfig = {
  enabled: enabledFromEnv(),
  dispatchOrigin: env(import.meta.env.VITE_PAYKIT_DISPATCH_ORIGIN) ?? 'https://localhost:18580',
  dispatchListener: env(import.meta.env.VITE_PAYKIT_DISPATCH_LISTENER) ?? 'http://127.0.0.1:18580',
  homeserver: homeserverFromEnv(),
  fakeHomeserverUrl: env(import.meta.env.VITE_PAYKIT_FAKE_HOMESERVER_URL) ?? 'http://127.0.0.1:18590',
  stagingHomeserver:
    env(import.meta.env.VITE_PAYKIT_STAGING_HOMESERVER) ?? 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy',
  stagingSignupToken: env(import.meta.env.VITE_PAYKIT_STAGING_SIGNUP_TOKEN),
  clientId: 'arkade-wallet',
  endpoints: [
    { identifier: BOARDING_ENDPOINT, fractionDigits: BTC_FRACTION_DIGITS },
    { identifier: SEGWIT_ENDPOINT, fractionDigits: BTC_FRACTION_DIGITS },
  ],
  payLimitMs: 180_000,
  esploraUrl: env(import.meta.env.VITE_PAYKIT_ESPLORA_URL) ?? 'http://127.0.0.1:3000/api',
}
