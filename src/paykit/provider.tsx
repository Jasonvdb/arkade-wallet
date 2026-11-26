import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { consoleError } from '../lib/logs'
import { AspContext } from '../providers/asp'
import { FeesContext } from '../providers/fees'
import { WalletContext } from '../providers/wallet'
import { PaykitClient, type HostHandlers } from './client'
import { paykitConfig, type HomeserverBackend } from './config'
import { createHomeserver } from './homeserver'
import { pubkyIdOf, secretToHex, storePrefixFor } from './identity'
import type { EngineCalls, EngineEvent, EngineOp, RequestId } from './protocol'
import { noPaymentsRail, type PageRail } from './rail'
import { walletRail, type ExitDeps } from './walletRail'
import { recordBoardingCoins } from './receive'
import { identitySecretState, subscribeIdentitySecret } from './secret'
import { PaykitSync, type PaykitSnapshot } from './sync'
import { acquireTabLock } from './tabLock'

/**
 * Where Paykit stands on this page:
 * - `off`: not enabled in this run (see `paykitConfig.enabled`)
 * - `locked`: no wallet is unlocked
 * - `unsupported`: the wallet has no recovery phrase to derive a Pubky identity from
 * - `waiting`: another tab runs Paykit; this one takes over when it closes
 * - `starting`, `ready`, `restarting` (after the worker died), `error`
 */
export type PaykitStatus = 'off' | 'locked' | 'unsupported' | 'waiting' | 'starting' | 'ready' | 'restarting' | 'error'

export interface PaykitState {
  status: PaykitStatus
  /** The Pubky ID, z-base-32 without a prefix, once the engine has started. */
  identity?: string
  /** `new`: this start enrolled the identity and joined the app; `loaded`: reopened from the device. */
  enrolment?: 'new' | 'loaded'
  appId?: string
  error?: string
}

export interface PaykitContextValue extends PaykitState {
  homeserver: HomeserverBackend
  dispatchOrigin: string
  /** Starts again after an error. */
  retry: () => void
  /** Runs an engine call; rejects while the engine is not ready. */
  call: <O extends EngineOp>(op: O, args: EngineCalls[O]['args']) => Promise<EngineCalls[O]['result']>
  /** Listens to what the engine reports by itself. */
  subscribe: (listener: (event: EngineEvent) => void) => () => void
  /** Pubky contacts' connections and the incoming Payment Requests (see `PaykitSync`). */
  data: PaykitSnapshot
  /** Reads the saved contacts again now, such as right after a Pubky contact was saved or deleted. */
  refreshContacts: () => void
  /** The Payment Request the request screen shows. */
  focusedRequest?: RequestId
  focusRequest: (id: RequestId | undefined) => void
  /** The request this wallet sent that the sent-request screen shows (its request hash). */
  focusedSent?: string
  focusSent: (requestHash: string | undefined) => void
  /** The Pubky contact the new-request screen asks (z-base-32). */
  requestContact?: string
  setRequestContact: (pubkyId: string | undefined) => void
  /**
   * The contact page to show when the contacts screen opens next (a contact's address), set by a Paykit
   * screen opened from it. Read once: `takeReturnContact` clears it.
   */
  takeReturnContact: () => string | undefined
  setReturnContact: (address: string | undefined) => void
}

const NO_DATA: PaykitSnapshot = {
  connections: {},
  requests: [],
  requestsLoaded: false,
  activity: [],
  activityLoaded: false,
  checks: {},
}

/** How often the boarding coins are read into the seen-cache while a sent request waits for its payment. */
const SEEN_POLL_MS = 5_000

/** Activity statuses that still wait for a payment or its check. */
const OPEN_ACTIVITY = new Set(['requested', 'accepted', 'proofReceived'])
const noSync = { subscribe: () => () => {}, getSnapshot: () => NO_DATA }

const notReady = () => Promise.reject(new Error('Paykit is not ready'))

export const PaykitContext = createContext<PaykitContextValue>({
  status: 'off',
  homeserver: paykitConfig.homeserver,
  dispatchOrigin: paykitConfig.dispatchOrigin,
  retry: () => {},
  call: notReady,
  subscribe: () => () => {},
  data: NO_DATA,
  refreshContacts: () => {},
  focusRequest: () => {},
  focusSent: () => {},
  setRequestContact: () => {},
  takeReturnContact: () => undefined,
  setReturnContact: () => {},
})

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'

/**
 * Runs the Paykit engine for the unlocked wallet: one worker per page, started with the Pubky identity the
 * wallet derives from its recovery phrase. Later features (contacts, requests, lists) read this context and
 * add their calls to the engine protocol.
 */
export function PaykitProvider({ children }: { children: ReactNode }) {
  const secretState = useSyncExternalStore(subscribeIdentitySecret, identitySecretState)
  const [state, setState] = useState<PaykitState>({ status: 'off' })
  const [attempt, setAttempt] = useState(0)
  const clientRef = useRef<PaykitClient>()
  const listeners = useRef(new Set<(event: EngineEvent) => void>())
  // The rail the engine calls: the wallet's collaborative exit, read from the wallet when a payment runs.
  const railRef = useRef<PageRail>(noPaymentsRail)
  const { svcWallet, reloadWallet } = useContext(WalletContext)
  const { calcOnchainOutputFee, intentFee } = useContext(FeesContext)
  const { aspInfo } = useContext(AspContext)
  const exitDeps = useRef<ExitDeps>()
  exitDeps.current = svcWallet
    ? { wallet: svcWallet, outputFee: calcOnchainOutputFee, intentFee, dust: () => Number(aspInfo.dust) }
    : undefined
  const [focusedRequest, setFocusedRequest] = useState<RequestId>()
  const [focusedSent, setFocusedSent] = useState<string>()
  const [requestContact, setRequestContact] = useState<string>()
  const returnContact = useRef<string>()
  const takeReturnContact = useCallback(() => {
    const address = returnContact.current
    returnContact.current = undefined
    return address
  }, [])
  const setReturnContact = useCallback((address: string | undefined) => {
    returnContact.current = address
  }, [])

  useEffect(() => {
    if (!paykitConfig.enabled) return setState({ status: 'off' })
    if (secretState.kind === 'none') return setState({ status: 'locked' })
    if (secretState.kind === 'unsupported') return setState({ status: 'unsupported' })

    const secret = secretState.secret.slice()
    const ownIdentity = pubkyIdOf(secret)
    const abort = new AbortController()
    const homeserver = createHomeserver(paykitConfig, secret, ownIdentity)
    railRef.current = walletRail(ownIdentity, () => exitDeps.current)
    let client: PaykitClient | undefined
    let releaseLock = () => {}

    const host: HostHandlers = {
      'hs.get': ({ identity, path }) => homeserver.get(identity, path),
      'hs.put': async ({ path, bytes }) => {
        await homeserver.put(path, bytes)
        return null
      },
      'hs.delete': async ({ path }) => {
        await homeserver.delete(path)
        return null
      },
      'rail.pay': (payment) => railRef.current.pay(payment),
      'rail.payment': ({ attemptId }) => railRef.current.payment(attemptId),
      'rail.verify': (check) => railRef.current.verify(check),
    }

    const run = async () => {
      setState({ status: 'starting' })
      const lock = await acquireTabLock(abort.signal, () => setState({ status: 'waiting' }))
      releaseLock = () => lock.release()
      if (abort.signal.aborted) return releaseLock()
      setState({ status: 'starting' })

      client = new PaykitClient({
        host,
        onEvent: (event) => listeners.current.forEach((listener) => listener(event)),
        onLifecycle: (change) => {
          if (abort.signal.aborted) return
          if (change.type === 'crashed') setState((s) => ({ ...s, status: 'restarting' }))
          if (change.type === 'restarted') {
            setState({
              status: 'ready',
              identity: change.result.identity,
              enrolment: change.result.enrolment,
              appId: change.result.appId,
            })
          }
          if (change.type === 'gave-up') setState({ status: 'error', error: change.error })
        },
      })
      clientRef.current = client

      const result = await client.start({
        identitySecretHex: secretToHex(secret),
        dispatchOrigin: paykitConfig.dispatchOrigin,
        dispatchListener: paykitConfig.dispatchListener,
        storePrefix: storePrefixFor(ownIdentity),
        clientId: paykitConfig.clientId,
        endpoints: paykitConfig.endpoints,
        payLimitMs: paykitConfig.payLimitMs,
      })
      if (abort.signal.aborted) return
      if (result.identity !== ownIdentity) throw new Error('the engine started with another identity')
      setState({ status: 'ready', identity: result.identity, enrolment: result.enrolment, appId: result.appId })
    }

    run().catch((error) => {
      if (abort.signal.aborted || isAbort(error)) return
      consoleError(error, 'Paykit could not start')
      setState({ status: 'error', error: describe(error) })
    })

    return () => {
      abort.abort()
      secret.fill(0)
      const stopping = client
      if (clientRef.current === stopping) clientRef.current = undefined
      const done = () => {
        homeserver.close()
        releaseLock()
      }
      if (stopping) stopping.stop().finally(done)
      else done()
    }
  }, [secretState, attempt])

  // Development builds: lets end-to-end tests crash the worker to exercise the restart.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = { crashWorker: () => clientRef.current?.call('crashForTest', undefined) }
    Object.assign(window, { __paykitDebug: debug })
    return () => {
      delete (window as { __paykitDebug?: unknown }).__paykitDebug
    }
  }, [])

  const call = useCallback(<O extends EngineOp>(op: O, args: EngineCalls[O]['args']) => {
    const client = clientRef.current
    if (!client) return notReady() as Promise<EngineCalls[O]['result']>
    return client.call(op, args)
  }, [])

  const subscribe = useCallback((listener: (event: EngineEvent) => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Contacts and incoming requests follow the engine while it runs for this identity (through restarts).
  const [sync, setSync] = useState<PaykitSync>()
  const syncIdentity = state.status === 'ready' || state.status === 'restarting' ? state.identity : undefined
  useEffect(() => {
    if (!syncIdentity) return setSync(undefined)
    const next = new PaykitSync(syncIdentity, call, subscribe)
    next.start()
    setSync(next)
    return () => next.stop()
  }, [syncIdentity, call, subscribe])
  const syncSource = sync ?? noSync
  const data = useSyncExternalStore(syncSource.subscribe, syncSource.getSnapshot)
  const refreshContacts = useCallback(() => sync?.refresh(), [sync])

  // While a sent request waits for its payment, keep the seen-cache of boarding coins (see `receive.ts`): a
  // coin the wallet boards leaves the boarding list, and the cache still dates and proves it.
  const awaitingPayment = data.activity.some((item) => OPEN_ACTIVITY.has(item.status))
  useEffect(() => {
    if (!syncIdentity || !awaitingPayment) return
    const read = () => {
      const wallet = exitDeps.current?.wallet
      if (wallet) recordBoardingCoins(syncIdentity, wallet).catch(() => {})
    }
    read()
    const timer = setInterval(read, SEEN_POLL_MS)
    return () => clearInterval(timer)
  }, [syncIdentity, awaitingPayment])

  // A confirmed payment is the wallet's own incoming coin: refresh the balance now rather than at the next poll.
  const reload = useRef(reloadWallet)
  reload.current = reloadWallet
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'activityUpdated' && event.activity.status === 'receipted') {
          reload.current().catch((error) => consoleError(error, 'Paykit could not refresh the balance'))
        }
      }),
    [subscribe],
  )

  const value = useMemo<PaykitContextValue>(
    () => ({
      ...state,
      homeserver: paykitConfig.homeserver,
      dispatchOrigin: paykitConfig.dispatchOrigin,
      retry,
      call,
      subscribe,
      data,
      refreshContacts,
      focusedRequest,
      focusRequest: setFocusedRequest,
      focusedSent,
      focusSent: setFocusedSent,
      requestContact,
      setRequestContact,
      takeReturnContact,
      setReturnContact,
    }),
    [
      state,
      retry,
      call,
      subscribe,
      data,
      refreshContacts,
      focusedRequest,
      focusedSent,
      requestContact,
      takeReturnContact,
      setReturnContact,
    ],
  )

  return <PaykitContext.Provider value={value}>{children}</PaykitContext.Provider>
}
