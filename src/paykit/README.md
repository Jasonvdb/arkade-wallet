# Paykit

Paykit v0.2 in the wallet: payment requests and private payment details between Pubky contacts. The engine is
the `paykit-wasm` build of paykit-rs, vendored in `pkg/`, so the wallet needs no Rust toolchain.

## Pieces

| File                        | What                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `pkg/`                      | The engine (`paykit_wasm.js`, `.wasm`, `.d.ts`). Generated: replace it, never edit it. |
| `worker.ts`                 | Dedicated module worker that owns the engine and its OPFS stores                       |
| `protocol.ts`               | The typed page/worker messages: engine calls, host callbacks, events                   |
| `client.ts`                 | Page side of the worker: pending calls, host callbacks, restart after a crash          |
| `provider.tsx`              | `PaykitProvider` / `PaykitContext`: starts the engine for the unlocked wallet          |
| `secret.ts`, `identity.ts`  | The Pubky identity: first 32 bytes of the BIP39 seed, held in memory only              |
| `homeserver.ts`             | Homeserver adapters: `fake` (local test server) and `staging` (`@synonymdev/pubky`)    |
| `rail.ts`                   | The wallet's payment method as the engine calls it (not wired to payments yet)         |
| `tabLock.ts`                | One tab runs the engine (Web Lock); another tab waits and takes over                   |
| `screens/PubkyIdentity.tsx` | Settings > Pubky identity                                                              |

## Configuration (`VITE_PAYKIT_*`)

| Variable                           | Default                       | Meaning                                                   |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------- |
| `VITE_PAYKIT_ENABLED`              | on when opened on `localhost` | `true` / `false` to force                                 |
| `VITE_PAYKIT_DISPATCH_ORIGIN`      | `https://localhost:18580`     | The origin Dispatch requests are signed for               |
| `VITE_PAYKIT_DISPATCH_LISTENER`    | `http://127.0.0.1:18580`      | The plain HTTP loopback listener they go to               |
| `VITE_PAYKIT_HOMESERVER`           | `fake`                        | `fake` or `staging`                                       |
| `VITE_PAYKIT_FAKE_HOMESERVER_URL`  | `http://127.0.0.1:18590`      | The fake Homeserver                                       |
| `VITE_PAYKIT_STAGING_HOMESERVER`   | the staging server's key      | z-base-32 public key                                      |
| `VITE_PAYKIT_STAGING_SIGNUP_TOKEN` | none                          | Single-use token for a first signup; keep in `.env.local` |

## Tests

`pnpm test:e2e:paykit` runs `src/test/e2e/paykit` against the local Dispatch, the fake Homeserver and the regtest
stack. `PAYKIT_SHOTS_DIR` saves screenshots; `ARKDEMO` names the demo's `arkdemo` script for funding.

## Demo shortcuts

- The identity key lives in the browser, next to the wallet's keys, and the Dispatch signer runs in the worker.
- The production CSP (`nginx-security-headers.conf`, `public/_headers`) does not allow WebAssembly compilation
  (`'wasm-unsafe-eval'`); the demo runs on the dev server, which sends no CSP.
