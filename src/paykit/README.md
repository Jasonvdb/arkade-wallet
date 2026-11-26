# Paykit

Paykit v0.2 in the wallet: payment requests and private payment details between Pubky contacts. The engine is
the `paykit-wasm` build of paykit-rs, vendored in `pkg/`, so the wallet needs no Rust toolchain.

## Pieces

| File                            | What                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pkg/`                          | The engine (`paykit_wasm.js`, `.wasm`, `.d.ts`) and its `API.md`. Generated: replace it, never edit it.     |
| `worker.ts`                     | Dedicated module worker that owns the engine and its OPFS stores                                            |
| `protocol.ts`                   | The typed page/worker messages: engine calls, host callbacks, events                                        |
| `client.ts`                     | Page side of the worker: pending calls, host callbacks, restart after a crash                               |
| `provider.tsx`                  | `PaykitProvider` / `PaykitContext`: starts the engine for the unlocked wallet                               |
| `secret.ts`, `identity.ts`      | The Pubky identity: first 32 bytes of the BIP39 seed, held in memory only                                   |
| `homeserver.ts`                 | Homeserver adapters: `fake` (local test server) and `staging` (`@synonymdev/pubky`)                         |
| `rail.ts`                       | The shape of the wallet's payment method as the engine calls it                                             |
| `walletRail.ts`                 | The rail: pays an approved request by collaborative exit, keeps one record per attempt                      |
| `receive.ts`                    | Receiving: sent-request records, the boarding-coin seen-cache, and the rail's `verify` of a payer's proof   |
| `pay.ts`                        | What a request asks this wallet to pay, refusal texts, the send screen's `PaykitSend`                       |
| `tabLock.ts`                    | One tab runs the engine (Web Lock); another tab waits and takes over                                        |
| `screens/PubkyIdentity.tsx`     | Settings > Pubky identity                                                                                   |
| `contacts.ts`                   | Pubky IDs as contacts (`pubky<id>` in the wallet's contacts), connection records                            |
| `sync.ts`                       | `PaykitSync`: allows each Pubky contact, probes whether it added the wallet back, follows incoming requests |
| `components/`                   | Connection status, incoming Payment Requests, and the send screen's request card and progress               |
| `screens/PaykitRequest.tsx`     | One Payment Request (`Pages.PaykitRequest`): Approve, Decline, the payment and the receipt                  |
| `screens/PaykitNewRequest.tsx`  | Ask a connected contact for money (`Pages.PaykitNewRequest`): amount and optional note                      |
| `screens/PaykitSentRequest.tsx` | One request this wallet sent (`Pages.PaykitSentRequest`): waiting, checking, received or too small          |

## Contacts

A Pubky contact is a saved contact whose address is a Pubky ID (`pubky<id>`, also accepted as `pk:<id>` or the
bare 52 characters). While the engine runs, every Pubky contact is allowed (`allowConnect`), so it may send
Payment Requests. Whether the contact added this wallet back is learned from an admission probe
(`probeAdmission`, a `resend_request` that selects nothing): its delivery stays `waitingForAdmission` until the
contact allows this wallet and turns `accepted` after. Any message from the contact also counts. The probe's
message ID and the connected time are kept per identity in localStorage (`paykit.connections.v1.<id>`); a
connected contact stays connected.

The engine's own feed loop receives, sends and runs the signer's due work while the wallet is open.

## Paying a Payment Request

1. A request row (contacts screen or the contact's page) opens `Pages.PaykitRequest`: who asks, how much, the
   note and the address. Approve, or Decline (`rejectRequest`, two taps).
2. Approve opens the wallet's own send confirmation (`Send/Details.tsx`) with `sendInfo.paykit`. The amount is
   what the payee receives; fees come on top. It is priced with the collaborative exit only (`quoteExit`).
   Coins still boarding cannot leave by exit: the screen says the bitcoin is still settling and offers
   Try again.
3. Tap to Sign registers an approval (address, amount, most the wallet may spend) and calls `payRequest`.
   The engine calls the rail's `pay`, which pays by exit through the wallet's router restricted to
   `WALLET_EXIT_RAIL`, and answers `{status: "paid", proof: {txid}}`. The txid is the batch transaction
   that holds the payee's output.
4. While the exit waits for a batch round, the screen shows the steps. Once paid, the request screen
   follows, first "Waiting for receipt", then the receipt.

The rail refuses (`failed`, nothing sent) a payment without a matching approval or whose quote costs more
than approved. Each attempt is recorded in localStorage `paykit.attempts.v1.<id>` before coins move; a
repeat or a restart answers from it. An exit that fails after coins may have moved is recorded `unknown`
and stays pending: it is never reported as failed, so it is never paid twice.

## Requesting money

1. On a connected Pubky contact's page, Request payment opens `Pages.PaykitNewRequest`: an amount and an optional note
   (empty means "Payment request"). Send request calls `sendRequest` with destination
   `{type: "endpoints", endpoints: [{identifier: "btc-regtest-p2tr", payload: {"value": <boarding address>}}]}`.
   The request is remembered in localStorage `paykit.sent.v1.<id>` (note, amount, address, time) and its screen opens.
2. `PaykitSync` follows the payee activity (`payeeActivity`, then `proofReceived` / `activityUpdated`). For each
   record in `proofReceived` it calls `confirmPayment`, which runs the rail's `verify` and, when it holds, sends the
   receipt. Not found yet: checked again every 5 s. Pays too little: shown as such, checked again once a minute, no
   receipt. Refused by the engine (such as a payment time before the request): shown as not confirmed.
3. `verify` (`receive.ts`) reads `GET <esplora>/tx/<txid>`, sums every output to the payload's address and accepts at
   or above the amount, 0-conf included. The payment time is the earliest of the coin's first sighting, its block time
   and now, so a transaction older than the request is refused by the engine. Without a payload (destination `any`),
   it checks the wallet's own boarding address.
4. Seen-cache: while a sent request waits, the boarding coins are read every 5 s into localStorage
   `paykit.seen.v1.<id>` with their first-seen time. A coin the wallet already boarded drops off the boarding list;
   the cache still dates it and proves it when esplora cannot be reached.
5. A confirmed payment reloads the wallet; the boarding coin shows in the balance and the wallet boards it by itself.

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
| `VITE_PAYKIT_ESPLORA_URL`          | `http://127.0.0.1:3000/api`   | The esplora API that payment proofs are checked against   |

## Tests

`pnpm test:e2e:paykit` runs `src/test/e2e/paykit` against the local Dispatch, the fake Homeserver and the regtest
stack. `PAYKIT_SHOTS_DIR` saves screenshots; `ARKDEMO` names the demo's `arkdemo` script for funding.

## Demo shortcuts

- Received payments are confirmed without asking the user: a proof whose transaction pays the amount is credited.
- The seen-cache and the sent-request records live in localStorage only; a cleared browser loses the notes and the
  first-seen times (the chain still verifies the payment).

- A payment cut off by a reload while its exit runs stays "paying" for good: the rail cannot tell whether
  the batch went through.

- The identity key lives in the browser, next to the wallet's keys, and the Dispatch signer runs in the worker.
- The production CSP (`nginx-security-headers.conf`, `public/_headers`) does not allow WebAssembly compilation
  (`'wasm-unsafe-eval'`); the demo runs on the dev server, which sends no CSP.
