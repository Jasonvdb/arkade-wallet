/* @ts-self-types="./paykit_wasm.d.ts" */

/**
 * Whether `identity` may start a conversation with this one, as this app's copy of the
 * allow and deny lists shows it.
 *
 * # Errors
 *
 * `invalid_input`, `not_started`, `busy`, or `paykit`.
 * @param {string} identity
 * @returns {Promise<boolean>}
 */
export function admits(identity) {
    const ptr0 = passStringToWasm0(identity, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.admits(ptr0, len0);
    return ret;
}

/**
 * Allows `identity` (a Pubky ID) to start a conversation with this one: a reply grant at
 * this identity's Dispatch, which also allows a pending connect request from it
 * (Dispatch spec 7). A payer allows each payee it expects requests from. Emits
 * `admissionChanged` when the admission changed.
 *
 * # Errors
 *
 * `invalid_input` for a malformed Pubky ID, `not_started`, `busy`, or `paykit`.
 * @param {string} identity
 * @returns {Promise<void>}
 */
export function allowConnect(identity) {
    const ptr0 = passStringToWasm0(identity, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.allowConnect(ptr0, len0);
    return ret;
}

/**
 * The started engine's App ID, base64url.
 *
 * # Errors
 *
 * `not_started`, or `busy` while the engine starts or stops.
 * @returns {string}
 */
export function appId() {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.appId(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr1 = r0;
        var len1 = r1;
        if (r3) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(r2);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Cancels the request this identity sent whose payee activity record is `record` (hex),
 * with an optional `reason`, and resolves to the cancellation's message ID. A proof that
 * crosses it still counts.
 *
 * # Errors
 *
 * `invalid_input`; `refused`; `conflict`; `not_started`, `busy`, or `paykit`.
 * @param {string} record
 * @param {string | null} [reason]
 * @returns {Promise<string>}
 */
export function cancelSentRequest(record, reason) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passStringToWasm0(record, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        len0 = WASM_VECTOR_LEN;
        ptr1 = isLikeNone(reason) ? 0 : passStringToWasm0(reason, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.cancelSentRequest(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * Verifies the payment in the payee activity record `record` (hex) as `verifyPayment`
 * does and, when the method confirms it, sends the payer a receipt. Resolves to the
 * receipt's message ID (the same one on a repeat), or `null` when the payment is not
 * confirmed. The record's status becomes `receipted`.
 *
 * # Errors
 *
 * As `verifyPayment`, and `refused` `divergent`.
 * @param {string} record
 * @returns {string | null}
 */
export function confirmPayment(record) {
    const ptr0 = passStringToWasm0(record, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.confirmPayment(ptr0, len0);
    return ret;
}

/**
 * The identity's allow list and deny list, read from its Dispatch (`Contacts` in the
 * declarations). Emits `admissionChanged` for each contact whose admission changed.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 * @returns {Contacts}
 */
export function contacts() {
    const ret = wasm.contacts();
    return ret;
}

/**
 * The started engine's Pubky ID, z-base-32, without a prefix.
 *
 * # Errors
 *
 * `not_started`, or `busy` while the engine starts or stops.
 * @returns {string}
 */
export function identity() {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.identity(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr1 = r0;
        var len1 = r1;
        if (r3) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(r2);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Installs the panic hook when the module is instantiated: a panic is reported to the
 * console, then aborts the instance, which the host replaces with a new worker.
 */
export function instantiated() {
    wasm.instantiated();
}

/**
 * Where the message this app sent as `msgId` stands, after one try of the outbox:
 * `accepted`, `queued`, `kept`, `waitingForAdmission`, `certificateNotCurrent` or
 * `failed`; `null` when the client keeps nothing of it (accepted or ended long ago, or
 * not sent from these stores).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 * @param {string} msg_id
 * @returns {string | null}
 */
export function messageDelivery(msg_id) {
    const ptr0 = passStringToWasm0(msg_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.messageDelivery(ptr0, len0);
    return ret;
}

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
 * @param {RequestId} id
 * @param {PayRequestOptions} [options]
 * @returns {PaymentOutcome}
 */
export function payRequest(id, options) {
    const ret = wasm.payRequest(id, options);
    return ret;
}

/**
 * The requests this identity sent and the payments it received as payee
 * (`PayeeRequest[]`).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 * @returns {PayeeRequest[]}
 */
export function payeeActivity() {
    const ret = wasm.payeeActivity();
    return ret;
}

/**
 * The payer's payments, from its journal (`PaymentEntry[]`), each with the payee's
 * receipt once it came.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 * @returns {PaymentEntry[]}
 */
export function payments() {
    const ret = wasm.payments();
    return ret;
}

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
 * @param {string} identity
 * @returns {Promise<string>}
 */
export function probeAdmission(identity) {
    const ptr0 = passStringToWasm0(identity, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.probeAdmission(ptr0, len0);
    return ret;
}

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
 * @param {string} identity
 * @returns {Promise<void>}
 */
export function publishListTo(identity) {
    const ptr0 = passStringToWasm0(identity, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.publishListTo(ptr0, len0);
    return ret;
}

/**
 * Runs one receive round now (`ReceiveResult`), emitting its events, as the feed loop
 * does: for a host that started with `autoReceive: false`, or wants a read at once.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit` when the read failed.
 * @returns {ReceiveResult}
 */
export function receive() {
    const ret = wasm.receive();
    return ret;
}

/**
 * The Private Payment Lists contacts shared with this identity (`ReceivedList[]`): the
 * latest from each of their apps, a withdrawn one with no endpoints. `listReceived`
 * tells each new one.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 * @returns {ReceivedList[]}
 */
export function receivedLists() {
    const ret = wasm.receivedLists();
    return ret;
}

/**
 * Rejects the request `id` as payer, with an optional `reason` the payee sees, and
 * resolves to the rejection's message ID.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`notFound`, `alreadyPaid`, `paymentInProgress`, ...);
 * `conflict`; `not_started`, `busy`, or `paykit`.
 * @param {RequestId} id
 * @param {string | null} [reason]
 * @returns {Promise<string>}
 */
export function rejectRequest(id, reason) {
    var ptr0 = isLikeNone(reason) ? 0 : passStringToWasm0(reason, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.rejectRequest(id, ptr0, len0);
    return ret;
}

/**
 * The payee's receipts of the request `id` the payer holds (`Receipt[]`).
 *
 * # Errors
 *
 * `invalid_input`, `not_started`, `busy`, or `paykit`.
 * @param {RequestId} id
 * @returns {Receipt[]}
 */
export function requestReceipts(id) {
    const ret = wasm.requestReceipts(id);
    return ret;
}

/**
 * The one-time requests this identity holds as payer (`OneTimeRequest[]`).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit` (also while the app's first listing is not done).
 * @returns {OneTimeRequest[]}
 */
export function requests() {
    const ret = wasm.requests();
    return ret;
}

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
 * @param {ResetOptions | undefined} options
 * @returns {Promise<void>}
 */
export function resetIdentity(options) {
    const ret = wasm.resetIdentity(options);
    return ret;
}

/**
 * Finishes the payments left open now (`PaymentOutcome[]`): one a restart interrupted,
 * or one whose method answered after the pay limit. The feed loop does it by itself once
 * after `start` and whenever a late answer comes; a host that drives the feed itself
 * (`autoReceive: false`) calls it.
 *
 * # Errors
 *
 * `not_started`, `busy`, `rail`, or `paykit`.
 * @returns {PaymentOutcome[]}
 */
export function resumePayments() {
    const ret = wasm.resumePayments();
    return ret;
}

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
 * @param {RequestInput} request
 * @returns {SentRequest}
 */
export function sendRequest(request) {
    const ret = wasm.sendRequest(request);
    return ret;
}

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
 * @param {ListEndpoint[]} endpoints
 * @returns {Promise<void>}
 */
export function setListEndpoints(endpoints) {
    const ret = wasm.setListEndpoints(endpoints);
    return ret;
}

/**
 * The Private Payment List this identity shares, and the contacts it is shared with
 * (`SharedList`).
 *
 * # Errors
 *
 * `not_started`, `busy`, or `paykit`.
 * @returns {SharedList}
 */
export function sharedList() {
    const ret = wasm.sharedList();
    return ret;
}

/**
 * Runs the signer's due work now (`Signer::run_due`): renewals of the app's certificate,
 * the key bundles the app asked for, and the deletions owed. The feed loop runs it once
 * a minute, and at once when a read waits for scope keys.
 *
 * # Errors
 *
 * `not_started`, `busy`, or `signer`.
 * @returns {SignerTick}
 */
export function signerTick() {
    const ret = wasm.signerTick();
    return ret;
}

/**
 * Starts the engine of this worker with `options` (`StartOptions` in the declarations),
 * then its feed loop unless `autoReceive` is `false`.
 *
 * # Errors
 *
 * `bad_options`, `already_started`, `busy`, `store`, `identity_mismatch`, `signer`,
 * `enrolment` or `paykit`.
 * @param {StartOptions} options
 * @returns {StartResult}
 */
export function start(options) {
    const ret = wasm.start(options);
    return ret;
}

/**
 * Stops the engine: ends the feed loop, waits for the call in progress, then closes the
 * signer and the app, which releases their stores.
 *
 * # Errors
 *
 * `not_started`, `busy` while the engine starts or stops, or `signer` when the signer
 * could not close cleanly; the engine is stopped either way.
 * @returns {Promise<void>}
 */
export function stop() {
    const ret = wasm.stop();
    return ret;
}

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
 * @param {string} record
 * @returns {number | null}
 */
export function verifyPayment(record) {
    const ptr0 = passStringToWasm0(record, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.verifyPayment(ptr0, len0);
    return ret;
}

/**
 * This crate's version.
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.version(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stops sharing the list with the contact `identity`: an empty list supersedes what it
 * holds. Emits `sharedListUpdated`.
 *
 * # Errors
 *
 * `invalid_input`; `refused` (`notNow`, `listDeliveryUnknown`); `not_started`, `busy`,
 * or `paykit`.
 * @param {string} identity
 * @returns {Promise<void>}
 */
export function withdrawListFrom(identity) {
    const ptr0 = passStringToWasm0(identity, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.withdrawListFrom(ptr0, len0);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_is_function_741ff2bb612836f5: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_c22311b1cc228e3a: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_8b968c3ab8e96595: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_fc456fee5d3317de: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_934b640d0889af78: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64((arg0 >>> 0) + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_7ce8eee7fd327545: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_09736879a3f67559: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_abort_75a93bc755ef5425: function() { return handleError(function (arg0) {
            arg0.abort();
        }, arguments); },
        __wbg_abort_f8d1589eb0c65ee2: function(arg0) {
            arg0.abort();
        },
        __wbg_addEventListener_847fd86b8c33ec43: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.addEventListener(getStringFromWasm0(arg1, arg2), arg3);
        }, arguments); },
        __wbg_algorithm_d2d2ca207f71212b: function() { return handleError(function (arg0) {
            const ret = arg0.algorithm;
            return ret;
        }, arguments); },
        __wbg_append_ba9a4dc30a0323fd: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_apply_bfe2b07b146427e2: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.apply(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_body_0da01a9a056907d8: function(arg0) {
            const ret = arg0.body;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_call_a410eb4b59ed5965: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_clearTimeout_1654a0fb10b8243b: function(arg0) {
            clearTimeout(arg0);
        },
        __wbg_close_264222edec0e3164: function(arg0) {
            arg0.close();
        },
        __wbg_close_70d38255291ae4c8: function(arg0) {
            arg0.close();
        },
        __wbg_createObjectStore_f7cf854ebb8a2b7f: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.createObjectStore(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_createSyncAccessHandle_9fc3d780677bd197: function(arg0) {
            const ret = arg0.createSyncAccessHandle();
            return ret;
        },
        __wbg_crypto_23f565a907d30078: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_crypto_642a55676274a4e1: function() { return handleError(function (arg0) {
            const ret = arg0.crypto;
            return ret;
        }, arguments); },
        __wbg_decrypt_0292ba3613732636: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.decrypt(arg1, arg2, getArrayU8FromWasm0(arg3, arg4));
            return ret;
        }, arguments); },
        __wbg_delete_a1677b105dc0626e: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.delete(arg1);
            return ret;
        }, arguments); },
        __wbg_done_57e08d0be6e30c02: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_encrypt_a958ea2fb42e62f3: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.encrypt(arg1, arg2, getArrayU8FromWasm0(arg3, arg4));
            return ret;
        }, arguments); },
        __wbg_entries_fb0b3ba27a6e0bf7: function(arg0) {
            const ret = arg0.entries();
            return ret;
        },
        __wbg_error_4b746601899e122c: function(arg0, arg1) {
            console.error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_fetch_4a893ba03fdd8ff0: function() { return handleError(function (arg0) {
            const ret = fetch(arg0);
            return ret;
        }, arguments); },
        __wbg_fill_6ab2ffab47cad7ab: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.fill(arg1, arg2 >>> 0, arg3 >>> 0);
            return ret;
        },
        __wbg_flush_34f73503687e5840: function() { return handleError(function (arg0) {
            arg0.flush();
        }, arguments); },
        __wbg_generateKey_57dd0e4027c20a79: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.generateKey(arg1, arg2 !== 0, arg3);
            return ret;
        }, arguments); },
        __wbg_getDirectoryHandle_7250477470a7f35b: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getDirectoryHandle(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_getDirectory_50787a69f3a13110: function(arg0) {
            const ret = arg0.getDirectory();
            return ret;
        },
        __wbg_getFileHandle_1cb5562219601c4f: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_getFileHandle_d551aa420ea57cd0: function(arg0, arg1, arg2) {
            const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_getRandomValues_07f3179f2d015362: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getRandomValues(getArrayU8FromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_getRandomValues_5d8c030b527203a6: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_d2908e0b99612b91: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_getReader_fadcafe607253a67: function(arg0) {
            const ret = arg0.getReader();
            return ret;
        },
        __wbg_getSize_c72004a2a12e972a: function() { return handleError(function (arg0) {
            const ret = arg0.getSize();
            return ret;
        }, arguments); },
        __wbg_get_2080c49015e35254: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_3e7d0feae205d645: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.get(arg1);
            return ret;
        }, arguments); },
        __wbg_get_556f1c9a5c587e8c: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg1.get(getStringFromWasm0(arg2, arg3));
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_get_d7176cfb76d71114: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_done_3bf2b4a34e149301: function(arg0) {
            const ret = arg0.done;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg_get_unchecked_e6325ad374eff861: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_value_9454480da7066d61: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_has_2c4d5cf25ec8c1cf: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_headers_5fc0106c076eb731: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_headers_9ef80dd266706f48: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_hostname_8ccf6cf3da91c969: function(arg0, arg1) {
            const ret = arg1.hostname;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_href_436d1661275da591: function(arg0, arg1) {
            const ret = arg1.href;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_indexedDB_1b567955abab7bb0: function() { return handleError(function (arg0) {
            const ret = arg0.indexedDB;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_instanceof_ArrayBuffer_12cdaa4161423e6b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_CryptoKey_50c903e21f76ad93: function(arg0) {
            let result;
            try {
                result = arg0 instanceof CryptoKey;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_DedicatedWorkerGlobalScope_3f1bee35601e7e7b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof DedicatedWorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_DomException_b0152473e22fa2bf: function(arg0) {
            let result;
            try {
                result = arg0 instanceof DOMException;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_74e3cca0c4a69161: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_FileSystemDirectoryHandle_4d0d8d8275d0019c: function(arg0) {
            let result;
            try {
                result = arg0 instanceof FileSystemDirectoryHandle;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_FileSystemFileHandle_5a487c9c312d952b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof FileSystemFileHandle;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_FileSystemSyncAccessHandle_75b74eadc68c22d2: function(arg0) {
            let result;
            try {
                result = arg0 instanceof FileSystemSyncAccessHandle;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbDatabase_3fd78b576d374c8e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof IDBDatabase;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_d7aeb0dcb3108fea: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_WorkerGlobalScope_a8f1cd8c19b6daec: function(arg0) {
            let result;
            try {
                result = arg0 instanceof WorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_bcf1376d0d732d08: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_length_186163212ffe79c3: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_b03a0fabb109b1e9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_method_3d406ebab4dd9853: function(arg0, arg1) {
            const ret = arg1.method;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_msCrypto_d5f06fad6bf1409b: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_name_7d5a865f2ff82e44: function(arg0, arg1) {
            const ret = arg1.name;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_name_d1fa514fdca6a975: function(arg0) {
            const ret = arg0.name;
            return ret;
        },
        __wbg_navigator_9641ab32fa612dd1: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_new_13de428334042d26: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_277c27c26f94cbc2: function() { return handleError(function () {
            const ret = new Headers();
            return ret;
        }, arguments); },
        __wbg_new_4416a2fe2fac9c65: function(arg0, arg1) {
            const ret = new TypeError(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_5f28518387ad0e34: function() { return handleError(function () {
            const ret = new AbortController();
            return ret;
        }, arguments); },
        __wbg_new_787b9fb330d55d78: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_96baed0986e0d99f: function() { return handleError(function (arg0, arg1) {
            const ret = new URL(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_ba40181b3f24ac80: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wasm_bindgen_func_elem_7390(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_cd4348290afae586: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_b8daf545a41c6aa0: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_e09da9dae6ee5935: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wasm_bindgen_func_elem_7390(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_length_01b143a7e5dd5a3e: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_new_with_str_and_init_d9f6b5611184e16b: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_next_af5ac6a08bb0a717: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_86166ff8ce1f2002: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_463ac581d2fc7ea3: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_now_fd321425714090e2: function() {
            const ret = performance.now();
            return ret;
        },
        __wbg_objectStore_a2b5ae038954c7ba: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.objectStore(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_of_027eb15371aac932: function(arg0) {
            const ret = Array.of(arg0);
            return ret;
        },
        __wbg_of_e7ea0fcd535c1444: function(arg0, arg1) {
            const ret = Array.of(arg0, arg1);
            return ret;
        },
        __wbg_open_0b7832f51fde5a5f: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.open(getStringFromWasm0(arg1, arg2), arg3 >>> 0);
            return ret;
        }, arguments); },
        __wbg_origin_fba7d3755dd37895: function(arg0, arg1) {
            const ret = arg1.origin;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_parse_c3f72b5a24f83c01: function() { return handleError(function (arg0, arg1) {
            const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_password_6ace9fadcdb503bf: function(arg0, arg1) {
            const ret = arg1.password;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_performance_7e4e4494fdc9d07a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_port_01d0a3797684e023: function(arg0, arg1) {
            const ret = arg1.port;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_process_91f425a63f58e399: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_protocol_e7b9813a6bd3e53b: function(arg0, arg1) {
            const ret = arg1.protocol;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_c9f4893fc209f768: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_put_45e63ad2e48de8d7: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.put(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_queueMicrotask_1e8503a8a690f0a3: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_4a1a4d8dd332373b: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_randomFillSync_34b023059e3363de: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_read_e3bea75dace70752: function(arg0) {
            const ret = arg0.read();
            return ret;
        },
        __wbg_read_fd16d549b57ad237: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.read(getArrayU8FromWasm0(arg1, arg2), arg3);
            return ret;
        }, arguments); },
        __wbg_removeEntry_66566d62eb738227: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.removeEntry(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_removeEventListener_4e20bd5fac3de092: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.removeEventListener(getStringFromWasm0(arg1, arg2), arg3);
        }, arguments); },
        __wbg_require_9a7d8cc2e1d275c0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_resolve_dbf78ab4942478b0: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_result_11a492b710594c52: function() { return handleError(function (arg0) {
            const ret = arg0.result;
            return ret;
        }, arguments); },
        __wbg_setTimeout_9968f5f21da7415c: function(arg0, arg1) {
            const ret = setTimeout(arg0, arg1 >>> 0);
            return ret;
        },
        __wbg_set_2793479888329cb6: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_additional_data_05ab2ea500278ed9: function(arg0, arg1) {
            arg0.additionalData = arg1;
        },
        __wbg_set_at_f569a2586a7350aa: function(arg0, arg1) {
            arg0.at = arg1;
        },
        __wbg_set_body_877d5251e78ca815: function(arg0, arg1) {
            arg0.body = arg1;
        },
        __wbg_set_cache_7a23201e29cbd632: function(arg0, arg1) {
            arg0.cache = __wbindgen_enum_RequestCache[arg1];
        },
        __wbg_set_create_29c03b2d68cbe451: function(arg0, arg1) {
            arg0.create = arg1 !== 0;
        },
        __wbg_set_create_8034c70deebee24f: function(arg0, arg1) {
            arg0.create = arg1 !== 0;
        },
        __wbg_set_credentials_bb5277b4006149d4: function(arg0, arg1) {
            arg0.credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_headers_6d75a7df4eb22716: function(arg0, arg1) {
            arg0.headers = arg1;
        },
        __wbg_set_iv_ed5385052ec4e125: function(arg0, arg1) {
            arg0.iv = arg1;
        },
        __wbg_set_length_c59d0e2a55bffafe: function(arg0, arg1) {
            arg0.length = arg1;
        },
        __wbg_set_method_639e69af35614d36: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_07e051ad8b4e2126: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_name_1901b97d4db16f01: function(arg0, arg1, arg2) {
            arg0.name = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_name_cad61b43483f8727: function(arg0, arg1, arg2) {
            arg0.name = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_onsuccess_8fa3ed2b93e36cae: function(arg0, arg1) {
            arg0.onsuccess = arg1;
        },
        __wbg_set_onupgradeneeded_e977e06888863122: function(arg0, arg1) {
            arg0.onupgradeneeded = arg1;
        },
        __wbg_set_recursive_23a91460289c2a19: function(arg0, arg1) {
            arg0.recursive = arg1 !== 0;
        },
        __wbg_set_redirect_a95a432ab7d10765: function(arg0, arg1) {
            arg0.redirect = __wbindgen_enum_RequestRedirect[arg1];
        },
        __wbg_set_referrer_policy_f3e837a21403cf06: function(arg0, arg1) {
            arg0.referrerPolicy = __wbindgen_enum_ReferrerPolicy[arg1];
        },
        __wbg_set_signal_0b2eee78907e5ba7: function(arg0, arg1) {
            arg0.signal = arg1;
        },
        __wbg_signal_fac908876f45725d: function(arg0) {
            const ret = arg0.signal;
            return ret;
        },
        __wbg_static_accessor_GLOBAL_THIS_003ee833af9699fc: function() {
            const ret = typeof globalThis === 'undefined' ? undefined : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_e4293fb22cbe77da: function() {
            const ret = typeof global === 'undefined' ? undefined : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_53bb20457401453d: function() {
            const ret = typeof self === 'undefined' ? undefined : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_b5e0810bfecb7feb: function() {
            const ret = typeof window === 'undefined' ? undefined : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_cb85b6c8d1769fa1: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_storage_681cb2810b22dae6: function(arg0) {
            const ret = arg0.storage;
            return ret;
        },
        __wbg_stringify_0a0fbf2ef722380a: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_subarray_58f388a9247ac0bb: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_subtle_28bc23a1c3440ebf: function(arg0) {
            const ret = arg0.subtle;
            return ret;
        },
        __wbg_then_656f253a5dd7d8ea: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e3f7f2d365708be8: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_transaction_5d30c7778ffaa174: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.transaction(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_transaction_a26f26d9d5badcda: function(arg0) {
            const ret = arg0.transaction;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_transaction_e026ac4b356359e7: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            const ret = arg0.transaction(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4), arg5);
            return ret;
        }, arguments); },
        __wbg_truncate_5f8dea9c665ccb45: function() { return handleError(function (arg0, arg1) {
            arg0.truncate(arg1);
        }, arguments); },
        __wbg_type_1a237db07c5ee2de: function(arg0) {
            const ret = arg0.type;
            return (__wbindgen_enum_ResponseType.indexOf(ret) + 1 || 7) - 1;
        },
        __wbg_usages_a31dc3b8ced35dbb: function(arg0) {
            const ret = arg0.usages;
            return ret;
        },
        __wbg_username_75b550f1f5bfb642: function(arg0, arg1) {
            const ret = arg1.username;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_value_e0f328965e184931: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_6e128a981b0df859: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbg_write_d97a1c0a72df2595: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.write(getArrayU8FromWasm0(arg1, arg2), arg3);
            return ret;
        }, arguments); },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 176, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_7315);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 90, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_8669);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./paykit_wasm_bg.js": import0,
    };
}

function __wasm_bindgen_func_elem_8669(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_8669(arg0, arg1, arg2);
}

function __wasm_bindgen_func_elem_7390(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_7390(arg0, arg1, arg2, arg3);
}

function __wasm_bindgen_func_elem_7315(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.__wasm_bindgen_func_elem_7315(retptr, arg0, arg1, arg2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeFromExternrefTable0(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}


const __wbindgen_enum_ReferrerPolicy = ["", "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "unsafe-url", "same-origin", "strict-origin", "strict-origin-when-cross-origin"];


const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];


const __wbindgen_enum_RequestRedirect = ["follow", "error", "manual"];


const __wbindgen_enum_ResponseType = ["basic", "cors", "default", "error", "opaque", "opaqueredirect"];

function addToExternrefTable0(obj) {
    const idx = wasm.__wbindgen_export5();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_export6(state.a, state.b));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_export4(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_export6(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__wbindgen_export7(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('paykit_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
