# Paykit

Paykit v0.2 in the wallet: payment requests and private payment details between Pubky contacts. The engine is
the `paykit-wasm` build of paykit-rs, vendored in `pkg/`, so the wallet needs no Rust toolchain.

## Pieces

| File                        | What                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pkg/`                      | The engine (`paykit_wasm.js`, `.wasm`, `.d.ts`) and its `API.md`. Generated: replace it, never edit it.     |
| `worker.ts`                 | Dedicated module worker that owns the engine and its OPFS stores                                            |
| `protocol.ts`               | The typed page/worker messages: engine calls, host callbacks, events                                        |
| `client.ts`                 | Page side of the worker: pending calls, host callbacks, restart after a crash                               |
| `provider.tsx`              | `PaykitProvider` / `PaykitContext`: starts the engine for the unlocked wallet                               |
| `secret.ts`, `identity.ts`  | The Pubky identity: first 32 bytes of the BIP39 seed, held in memory only                                   |
| `homeserver.ts`             | Homeserver adapters: `fake` (local test server) and `staging` (`@synonymdev/pubky`)                         |
| `rail.ts`                   | The wallet's payment method as the engine calls it (not wired to payments yet)                              |
| `tabLock.ts`                | One tab runs the engine (Web Lock); another tab waits and takes over                                        |
| `screens/PubkyIdentity.tsx` | Settings > Pubky identity                                                                                   |
| `contacts.ts`               | Pubky IDs as contacts (`pubky<id>` in the wallet's contacts), connection records                            |
| `sync.ts`                   | `PaykitSync`: allows each Pubky contact, probes whether it added the wallet back, follows incoming requests |
| `components/`               | Connection status and the incoming Payment Requests, shown in Settings > Contacts                           |

## Contacts

A Pubky contact is a saved contact whose address is a Pubky ID (`pubky<id>`, also accepted as `pk:<id>` or the
bare 52 characters). While the engine runs, every Pubky contact is allowed (`allowConnect`), so it may send
Payment Requests. Whether the contact added this wallet back is learned from an admission probe
(`probeAdmission`, a `resend_request` that selects nothing): its delivery stays `waitingForAdmission` until the
contact allows this wallet and turns `accepted` after. Any message from the contact also counts. The probe's
message ID and the connected time are kept per identity in localStorage (`paykit.connections.v1.<id>`); a
connected contact stays connected.

The engine's own feed loop receives, sends and runs the signer's due work while the wallet is open.

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
