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
 * Starts the engine of this worker with `options` (`StartOptions` in the declarations).
 *
 * # Errors
 *
 * `bad_options`, `already_started`, `busy`, `store`, `identity_mismatch`, `signer`,
 * `enrolment` or `paykit`.
 */
export function start(options: StartOptions): Promise<StartResult>;

/**
 * Stops the engine: closes the signer and the app, which releases their stores.
 *
 * # Errors
 *
 * `not_started`, `busy` while another call is in progress, or `signer` when the signer
 * could not close cleanly; the engine is stopped either way.
 */
export function stop(): Promise<void>;

/**
 * This crate's version.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly identity: (a: number) => void;
    readonly instantiated: () => void;
    readonly start: (a: any) => any;
    readonly stop: () => any;
    readonly version: (a: number) => void;
    readonly __wasm_bindgen_func_elem_3180: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_3257: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_4537: (a: number, b: number, c: any) => void;
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
