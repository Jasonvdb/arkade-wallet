/* tslint:disable */
/* eslint-disable */

/** The host's Homeserver. `get` reads any identity's public file; `put` and `delete` write the
 * engine's own identity's Homeserver and resolve once the write is durable. Paths are absolute
 * (`/pub/...`, `/priv/...`). */
export interface EngineHomeserver {
    /** The file's bytes, or `null` when it is absent. */
    get(identityZ32: string, path: string): Promise<Uint8Array | null>;
    put(path: string, bytes: Uint8Array): Promise<void>;
    delete(path: string): Promise<void>;
}

/** A Payment Endpoint Identifier the host's method pays, with its fraction digits. */
export interface EndpointSupport {
    identifier: string;
    fractionDigits: number;
}

/** An amount: a decimal string in whole units of the asset. */
export interface RailAmount {
    value: string;
    asset: string;
}

/** A payment to make. `attemptId` is the idempotency key. */
export interface RailPayment {
    attemptId: string;
    endpointId: string;
    /** The endpoint's payload, as published, such as `{"value":"<address>"}`. */
    payload: string;
    amount: RailAmount;
    paymentReference: string | null;
}

/** A payment's outcome: paid with its proof, definitely failed, or not settled yet. */
export type RailOutcome =
| { status: "paid"; proof: Record<string, unknown>; paidAtMs?: number }
| { status: "failed" }
| { status: "pending" };

/** A received proof for the payee's method to check. */
export interface RailProofCheck {
    endpointId: string;
    /** The endpoint's payload as the payee signed it; `null` for a request with destination
     * `any` or `app`, whose payment the method checks against its own endpoints for
     * `endpointId`, such as the addresses in its Private Payment List. */
    payload: string | null;
    amount: RailAmount;
    attemptId: string;
    proof: Record<string, unknown>;
}

/** The host's payment method. The engine answers what it can from `endpoints`; the callbacks
 * are called for the rest. A missing callback makes that call fail as unavailable (`pay`:
 * refused, nothing sent). */
export interface EngineRail {
    endpoints: EndpointSupport[];
    /** How long a payment waits for `pay`, in ms: 1,000 to 3,600,000, default 60,000. Past it
     * `pay` goes on by itself, the attempt stays open (`payRequest` resolves `pending`), and
     * the engine finishes the payment when `pay` answers. */
    payLimitMs?: number;
    /** Must answer `{status: "paid"}` or `{status: "failed"}` once the payment is decided, and
     * may take as long as the method needs. The engine never calls it twice at once for one
     * `attemptId`, and a repeat with an `attemptId` already paid must return that payment. */
    pay?(payment: RailPayment): Promise<RailOutcome>;
    /** `null` only when `pay` was never called with `attemptId`. */
    payment?(attemptId: string): Promise<RailOutcome | null>;
    /** The verified payment time in Unix milliseconds, or `null`. */
    verify?(check: RailProofCheck): Promise<number | null>;
}

/** The options of `start`. */
export interface StartOptions {
    /** The identity's 32-byte secret key, as 64 hex digits. */
    identitySecretHex: string;
    /** The Dispatch origin requests are signed for, such as `https://localhost:18580`. */
    dispatchOrigin: string;
    /** A plain HTTP loopback listener that requests for a `https://localhost` origin go to,
     * such as `http://127.0.0.1:18580`; omit it to reach the origin itself. */
    dispatchListener?: string;
    /** The prefix of the store names `<prefix>-app` and `<prefix>-signer`: 1 to 57 ASCII
     * letters, digits, `-` or `_`. Default `paykit`. It must not name the identity. */
    storePrefix?: string;
    /** The client ID of the app's authentication request. Default `paykit-wasm`. */
    clientId?: string;
    /** Whether the engine runs its own feed loop until `stop`. Default `true`; with `false`
     * the host calls `receive` itself. */
    autoReceive?: boolean;
    /** Called with each event, in order. A callback that throws is ignored. */
    onEvent?: (event: EngineEvent) => void;
    homeserver: EngineHomeserver;
    rail: EngineRail;
}

/** What `start` resolves to. */
export interface StartResult {
    /** The identity's Pubky ID, z-base-32, without a prefix. */
    identity: string;
    /** The app's App ID, base64url. */
    appId: string;
    /** `new`: enrolled and joined now; `loaded`: reopened from the stores. */
    enrolment: "new" | "loaded";
}

/** A request's ID: the payee's Pubky ID and the request hash in hex. */
export interface RequestId {
    payee: string;
    requestHash: string;
}

/** Where a request is paid, as its signed body names it. */
export type RequestDestination =
| { type: "endpoints"; endpoints: { identifier: string; payload: string }[] }
| { type: "app"; appId: string }
| { type: "any" };

/** A receipt the payer holds. */
export interface Receipt {
    record: string;
    payee: string;
    requestHash: string | null;
    attemptId: string;
    messageId: string;
    acceptedAtMs: number | null;
    paymentReference: string | null;
}

/** What the payer sees of a request (paykit-ffi `OneTimeRequestStatus`). */
export type OneTimeRequestStatus =
| "open" | "beingPaidHere" | "beingHandledByOtherWallet" | "mayBePaid" | "paid"
| "rejected" | "cancelled" | "expired" | "held" | "unrecorded" | "blocked" | "divergent"
| string;

/** A one-time request the payer holds (paykit-ffi `OneTimeRequest`). */
export interface OneTimeRequest {
    id: RequestId;
    record: string;
    amount: RailAmount;
    paymentReference: string;
    label: string | null;
    proposalExpiresAtMs: number | null;
    status: OneTimeRequestStatus;
    held: boolean;
    manualOnly: boolean;
    divergent: boolean;
    receipt: Receipt | null;
    destination: RequestDestination;
}

/** A Payment Request to send (`sendRequest`). */
export interface RequestInput {
    /** The payer's Pubky ID. The payer must admit this identity (its `allowConnect`). */
    to: string;
    amount: RailAmount;
    /** The payer sees it with the request, and it is copied into the receipt: 1 to 256
     * characters, no control characters. */
    paymentReference: string;
    /** Where to pay: endpoints the host supplies, such as `[{identifier: "btc-regtest-p2tr",
     * payload: "{\"value\":\"<address>\"}"}]`; or `any`: an endpoint of the Private Payment
     * List this identity shared with the payer, or its public endpoints. */
    destination: RequestDestination;
    /** The last time the payer may act on it, in Unix ms. */
    proposalExpiresAtMs?: number;
    /** The deadline of the payment itself, in Unix ms. */
    paymentDeadlineMs?: number;
}

/** A request just sent. `delivery`: `accepted` (in the payer's inbox), `queued`, `kept`,
 * `waitingForAdmission` (the payer does not admit this identity yet), ... */
export interface SentRequest {
    msgId: string;
    delivery: string;
    request: RequestId | null;
}

/** The options of `payRequest`. */
export interface PayRequestOptions {
    /** The Payment Endpoint Identifier to pay; the first usable one otherwise. */
    endpoint?: string;
    /** For a request whose destination is `any` or `app`: the App ID (base64url) of the payee
     * app whose Private Payment List to pay; any current one otherwise. */
    listApp?: string;
    /** For a request whose destination is `any` or `app`: `private` (the default) pays an
     * endpoint of the payee's Private Payment Lists; `public` pays the payee's public
     * endpoints, and is passed only when the user chose them. */
    mode?: "private" | "public";
}

/** A reusable Payment Endpoint of a Private Payment List. */
export interface ListEndpoint {
    /** The Payment Endpoint Identifier, such as `btc-regtest-p2tr`. */
    identifier: string;
    /** The payload, such as `{"value":"<address>"}`. */
    payload: string;
}

/** A Private Payment List's version: greater for each newer list of one app to one
 * contact. */
export interface ListVersion {
    generation: number;
    counter: number;
}

/** A Private Payment List a contact shared with this identity: its latest version from one
 * of the contact's apps. */
export interface ReceivedList {
    /** The contact's Pubky ID. */
    payee: string;
    /** The contact's app that published it (base64url): `payRequest`'s `listApp`. */
    appId: string;
    version: ListVersion;
    /** Empty once the contact withdrew its details. */
    endpoints: ListEndpoint[];
    /** When this identity's inbox accepted it, in Unix ms. */
    acceptedAtMs: number | null;
    /** From this instant (Unix ms) no payment uses it: the earlier of its expiry and 30 days
     * after it was accepted. */
    usableUntilMs: number;
    /** It has endpoints and has not expired, as of the read. A payment checks it again. */
    usable: boolean;
}

/** The Private Payment List this identity shares, and with whom. */
export interface SharedList {
    /** As `setListEndpoints` last set them; `null` before it was called. */
    endpoints: ListEndpoint[] | null;
    /** The contacts it is shared with (Pubky IDs): chosen with `publishListTo` and not
     * withdrawn since. Each is sent the current list, now or at a later round. */
    recipients: string[];
}

/** What became of a payment (paykit-ffi `PaymentOutcome`): `paid` (the proof is sent or
 * queued), `pending` (the method has not answered yet; the engine finishes it when it does),
 * `failed` (definitely not paid), `uncertain` (may be paid: the user decides), and the rarer
 * `paidUnreported`, `paidOutcomeUnwritten`, `recordHeld`, `recordDivergent`, `resolved`. */
export interface PaymentOutcome {
    outcome: string;
    attemptId: string;
    proofMessageId?: string | null;
    reason?: string;
}

/** A payment in the payer's journal (paykit-ffi `PaymentEntry`). */
export interface PaymentEntry {
    attemptId: string;
    payee: string;
    requestHash: string | null;
    amount: RailAmount;
    endpoint: string;
    /** `recorded`, `attempted`, `paying`, `railPaid`, `railFailed`, `acceptanceOwed`,
     * `finished` or `abandoned`. */
    stage: string;
    paidByMethod: boolean;
    recordHeld: boolean;
    paid: RailAmount | null;
    receipt: Receipt | null;
}

/** What the payee sees (paykit-ffi `PayeeStatus`). */
export type PayeeStatus =
| "requested" | "accepted" | "rejected" | "cancelled" | "proofReceived" | "receipted"
| string;

/** A request the payee sent, or a payment it received without one (paykit-ffi
 * `PayeeRequest`). */
export interface PayeeRequest {
    record: string;
    payer: string;
    requestHash: string | null;
    amount: RailAmount | null;
    label: string | null;
    attemptId: string | null;
    status: PayeeStatus;
    divergent: boolean;
    recurring: boolean;
}

/** A contact's admission: whether it may start a conversation with this identity. */
export interface Admission {
    identity: string;
    admitted: boolean;
    kept: boolean;
    reply: boolean;
}

/** The identity's allow list and deny list, as its Dispatch holds them. */
export interface Contacts {
    allowed: Admission[];
    denied: string[];
}

/** What a receive round did. */
export interface ReceiveResult {
    generation: number;
    sequence: number;
    more: boolean;
    stopped: boolean;
    scopeKeysAwaited: boolean;
    recordsUnlisted: string | null;
    accountGone: boolean;
    /** The message IDs whose effects the round applied. */
    applied: string[];
}

/** An event of the engine, given to `onEvent`. `atMs` is the worker's clock. */
export type EngineEvent = { atMs: number } & (
| ({ type: "received" } & ReceiveResult)
| { type: "messageReceived"; kind: string; msgId: string; sender: string; seq: number }
| ({ type: "admissionChanged" } & Admission)
| { type: "requestReceived"; request: OneTimeRequest }
| { type: "requestUpdated"; request: OneTimeRequest; previousStatus: string }
| { type: "receiptReceived"; request: OneTimeRequest; receipt: Receipt }
| { type: "proofReceived"; activity: PayeeRequest }
| { type: "activityUpdated"; activity: PayeeRequest; previousStatus: string | null }
| { type: "paymentsResumed"; outcomes: PaymentOutcome[] }
| { type: "listReceived"; list: ReceivedList; previousVersion: ListVersion | null }
| { type: "sharedListUpdated"; list: SharedList }
| { type: "error"; during: string; code: string; message: string }
| { type: "feedStopped"; reason: string }
);

/** What `signerTick` did. */
export interface SignerTick {
    /** More work was due than one run does: tick again soon. */
    moreDue: boolean;
}

/** The options of `resetIdentity` when no engine runs in the worker. */
export interface ResetOptions {
    /** The prefix of the stores to destroy. Default `paykit`. */
    storePrefix?: string;
    /** The Homeserver to delete the signer's files from; omitted, they stay. */
    homeserver?: EngineHomeserver;
}



/**
 * Whether `identity` may start a conversation with this one, as this app's copy of the
 * allow and deny lists shows it.
 *
 * # Errors
 *
 * `invalid_input`, `not_started`, `busy`, or `paykit`.
 */
export function admits(identity: string): Promise<boolean>;

/**
 * Allows `identity` (a Pubky ID) to start a conversation with this one: a reply grant at
 * this identity's Dispatch, which also allows a pending connect request from it
 * (Dispatch spec 7). A payer allows each payee it expects requests from. Emits
 * `admissionChanged` when the admission changed.
 *
 * # Errors
 *
 * `invalid_input` for a malformed Pubky ID, `not_started`, `busy`, or `paykit`.
 */
export function allowConnect(identity: string): Promise<void>;

/**
 * The started engine's App ID, base64url.
 *
 * # Errors
 *
 * `not_started`, or `busy` while the engine starts or stops.
 */
export function appId(): string;

/**
 * Cancels the request this identity sent whose payee activity record is `record` (hex),
 * with an optional `reason`, and resolves to the cancellation's message ID. A proof that
 * crosses it still counts.
 *
 * # Errors
 *
 * `invalid_input`; `refused`; `conflict`; `not_started`, `busy`, or `paykit`.
 */
export function cancelSentRequest(record: string, reason?: string | null): Promise<string>;

/**
 * Verifies the payment in the payee activity record `record` (hex) as `verifyPayment`
 * does and, when the method confirms it, sends the payer a receipt. Resolves to the
 * receipt's message ID (the same one on a repeat), or `null` when the payment is not
 * confirmed. The record's status becomes `receipted`.
 *
 * # Errors
 *
 * As `verifyPayment`, and `refused` `divergent`.
 */
export function confirmPayment(record: string): Promise<string | null>;

/**
 * The identity's allow list and deny list, read from its Dispatch (`Contacts` in the
 * declarations). Emits `admissionChanged` for each contact whose admission changed.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 */
export function contacts(): Promise<Contacts>;

/**
 * The started engine's Pubky ID, z-base-32, without a prefix.
 *
 * # Errors
 *
 * `not_started`, or `busy` while the engine starts or stops.
 */
export function identity(): string;

/**
 * Installs the panic hook when the module is instantiated: a panic is reported to the
 * console, then aborts the instance, which the host replaces with a new worker.
 */
export function instantiated(): void;

/**
 * Where the message this app sent as `msgId` stands, after one try of the outbox:
 * `accepted`, `queued`, `kept`, `waitingForAdmission`, `certificateNotCurrent` or
 * `failed`; `null` when the client keeps nothing of it (accepted or ended long ago, or
 * not sent from these stores).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 */
export function messageDelivery(msg_id: string): Promise<string | null>;

/**
 * Pays the request `id` (`RequestId`) as payer: the SDK writes the attempt, the host's
 * `rail.pay` pays it, and the proof is sent to the payee. Resolves to `PaymentOutcome`:
 * `paid` once the method paid within the pay limit, `pending` when it has not answered
 * yet (the engine finishes the payment when it does: `paymentsResumed`).
 *
 * # Errors
 *
 * `invalid_input`; `refused` when the request is not payable, nothing paid, with
 * `reason` such as `alreadyPaid`, `paymentInProgress`, `rejected`, `cancelled`,
 * `noDestination`, `unsupportedEndpoint` or `attemptFailed`, or for a request with
 * destination `any` `waitingForList` (no usable list from the payee yet: the engine has
 * asked it for one; try again after `listReceived`); `conflict`; `not_started`,
 * `busy`, or `paykit`. A failure after money may have moved is never an error: it is the
 * `pending` or `uncertain` outcome.
 */
export function payRequest(id: RequestId, options?: PayRequestOptions): Promise<PaymentOutcome>;

/**
 * The requests this identity sent and the payments it received as payee
 * (`PayeeRequest[]`).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 */
export function payeeActivity(): Promise<PayeeRequest[]>;

/**
 * The payer's payments, from its journal (`PaymentEntry[]`), each with the payee's
 * receipt once it came.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 */
export function payments(): Promise<PaymentEntry[]>;

/**
 * Sends `identity` a `resend_request` that selects nothing (one fresh, unknown message
 * ID), so that its delivery tells whether `identity` admits this one: Paykit has no read
 * of the other side's allow list. Resolves to the request's message ID; read it with
 * `messageDelivery`. It stays `waitingForAdmission` until `identity` admits this one,
 * and turns `accepted` at the first delivery try after. The recipient has nothing to
 * re-send, and a `resend_request` adds no reply grant.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`scopeMissing` for an app approved without
 * `paykit_contacts`, `heldForUser`); `not_started`, `busy`, or `paykit`.
 */
export function probeAdmission(identity: string): Promise<string>;

/**
 * Shares the list `setListEndpoints` set with the contact `identity` (a Pubky ID): a
 * signed Private Payment List goes to its inbox, now or at a later round. The contact
 * must admit this identity (its `allowConnect`). Emits `sharedListUpdated`.
 *
 * # Errors
 *
 * `invalid_input`; `refused`: `usage` before the list is set or for this identity
 * itself, `heldForUser` while the deny list holds the contact, `notNow` while an
 * earlier publication to it is unresolved (a later round sends it), or
 * `listDeliveryUnknown`; `not_started`, `busy`, or `paykit`.
 */
export function publishListTo(identity: string): Promise<void>;

/**
 * Runs one receive round now (`ReceiveResult`), emitting its events, as the feed loop
 * does: for a host that started with `autoReceive: false`, or wants a read at once.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit` when the read failed.
 */
export function receive(): Promise<ReceiveResult>;

/**
 * The Private Payment Lists contacts shared with this identity (`ReceivedList[]`): the
 * latest from each of their apps, a withdrawn one with no endpoints. `listReceived`
 * tells each new one.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 */
export function receivedLists(): Promise<ReceivedList[]>;

/**
 * Rejects the request `id` as payer, with an optional `reason` the payee sees, and
 * resolves to the rejection's message ID.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`notFound`, `alreadyPaid`, `paymentInProgress`, ...);
 * `conflict`; `not_started`, `busy`, or `paykit`.
 */
export function rejectRequest(id: RequestId, reason?: string | null): Promise<string>;

/**
 * The payee's receipts of the request `id` the payer holds (`Receipt[]`).
 *
 * # Errors
 *
 * `invalid_input`, `not_started`, `busy`, or `paykit`.
 */
export function requestReceipts(id: RequestId): Promise<Receipt[]>;

/**
 * The one-time requests this identity holds as payer (`OneTimeRequest[]`).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit` (also while the app's first listing is not done).
 */
export function requests(): Promise<OneTimeRequest[]>;

/**
 * For tests: removes this worker's engine and the identity's enrolment state, so the
 * identity can be enrolled again, such as after the Dispatch's database was reset.
 *
 * It stops the engine if one runs, destroys its two stores, and deletes the signer's
 * `identity.json` and backup from the identity's Homeserver. With no engine running, it
 * destroys the stores of `options.storePrefix`, and deletes the signer's files through
 * `options.homeserver` when given. The identity's account at the Dispatch is left as it
 * is.
 *
 * # Errors
 *
 * `bad_options`, `busy`, `store` when a store is still held elsewhere, or `homeserver`
 * when a delete failed; the stores are destroyed first, so calling it again with the
 * Homeserver finishes it.
 */
export function resetIdentity(options: ResetOptions | undefined): Promise<void>;

/**
 * Finishes the payments left open now (`PaymentOutcome[]`): one a restart interrupted,
 * or one whose method answered after the pay limit. The feed loop does it by itself once
 * after `start` and whenever a late answer comes; a host that drives the feed itself
 * (`autoReceive: false`) calls it.
 *
 * # Errors
 *
 * `not_started`, `busy`, `rail`, or `paykit`.
 */
export function resumePayments(): Promise<PaymentOutcome[]>;

/**
 * Signs and sends a Payment Request (`RequestInput`) as payee, records it, and tries to
 * deliver it at once. Resolves to `SentRequest`; the payee activity shows the request
 * from now on (`activityUpdated`, status `requested`).
 *
 * # Errors
 *
 * `invalid_input` for a malformed request; `refused` (such as `reason` `scopeMissing`,
 * `heldForUser` or `notNow`); `not_started`, `busy`, or `paykit`. After a `paykit` error
 * read `payeeActivity()` before sending it again: the request may have been kept.
 */
export function sendRequest(request: RequestInput): Promise<SentRequest>;

/**
 * Sets the reusable Private Payment List this identity shares (`ListEndpoint[]`), such
 * as `[{identifier: "btc-regtest-p2tr", payload: "{\"value\":\"<address>\"}"}]`. Each
 * contact it is shared with is sent the changed list, now or at a later round; an empty
 * list withdraws the details from all of them. Emits `sharedListUpdated`.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`scopeMissing`, `notNow`, ...); `not_started`, `busy`, or
 * `paykit`.
 */
export function setListEndpoints(endpoints: ListEndpoint[]): Promise<void>;

/**
 * The Private Payment List this identity shares, and the contacts it is shared with
 * (`SharedList`).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 */
export function sharedList(): Promise<SharedList>;

/**
 * Runs the signer's due work now (`Signer::run_due`): renewals of the app's certificate,
 * the key bundles the app asked for, and the deletions owed. The feed loop runs it once
 * a minute, and at once when a read waits for scope keys.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `signer`.
 */
export function signerTick(): Promise<SignerTick>;

/**
 * Starts the engine of this worker with `options` (`StartOptions` in the declarations),
 * then its feed loop unless `autoReceive` is `false`.
 *
 * # Errors
 *
 * `bad_options`, `already_started`, `busy`, `store`, `identity_mismatch`, `signer`,
 * `enrolment` or `paykit`.
 */
export function start(options: StartOptions): Promise<StartResult>;

/**
 * Stops the engine: ends the feed loop, waits for the call in progress, then closes the
 * signer and the app, which releases their stores.
 *
 * # Errors
 *
 * `not_started`, `busy` while the engine starts or stops, or `signer` when the signer
 * could not close cleanly; the engine is stopped either way.
 */
export function stop(): Promise<void>;

/**
 * Checks the proof the payee activity record `record` (hex) holds with the host's
 * `rail.verify`, against the request's destination, amount and times. Resolves to the
 * verified payment time in Unix ms, or `null` when the method does not confirm it, or
 * the settlement is credited to another payment already.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`notFound` for a record without a proof,
 * `paymentTimeOutside`, `maybeCredited`, ...); `rail` when the method could not check it
 * now; `not_started`, `busy`, or `paykit`.
 */
export function verifyPayment(record: string): Promise<number | null>;

/**
 * This crate's version.
 */
export function version(): string;

/**
 * Stops sharing the list with the contact `identity`: an empty list supersedes what it
 * holds. Emits `sharedListUpdated`.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`notNow`, `listDeliveryUnknown`); `not_started`, `busy`,
 * or `paykit`.
 */
export function withdrawListFrom(identity: string): Promise<void>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly admits: (a: number, b: number) => any;
    readonly allowConnect: (a: number, b: number) => any;
    readonly appId: (a: number) => void;
    readonly cancelSentRequest: (a: number, b: number, c: number, d: number) => any;
    readonly confirmPayment: (a: number, b: number) => any;
    readonly contacts: () => any;
    readonly identity: (a: number) => void;
    readonly instantiated: () => void;
    readonly messageDelivery: (a: number, b: number) => any;
    readonly payRequest: (a: any, b: any) => any;
    readonly payeeActivity: () => any;
    readonly payments: () => any;
    readonly probeAdmission: (a: number, b: number) => any;
    readonly publishListTo: (a: number, b: number) => any;
    readonly receive: () => any;
    readonly receivedLists: () => any;
    readonly rejectRequest: (a: any, b: number, c: number) => any;
    readonly requestReceipts: (a: any) => any;
    readonly requests: () => any;
    readonly resetIdentity: (a: any) => any;
    readonly resumePayments: () => any;
    readonly sendRequest: (a: any) => any;
    readonly setListEndpoints: (a: any) => any;
    readonly sharedList: () => any;
    readonly signerTick: () => any;
    readonly start: (a: any) => any;
    readonly stop: () => any;
    readonly verifyPayment: (a: number, b: number) => any;
    readonly version: (a: number) => void;
    readonly withdrawListFrom: (a: number, b: number) => any;
    readonly __wasm_bindgen_func_elem_7315: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_7390: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_8669: (a: number, b: number, c: any) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export4: (a: number) => void;
    readonly __wbindgen_export5: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_export6: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export7: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
