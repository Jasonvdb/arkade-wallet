import {
  ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { consoleError } from '../lib/logs'
import { PaykitClient, type HostHandlers } from './client'
import { paykitConfig, type HomeserverBackend } from './config'
import { createHomeserver } from './homeserver'
import { pubkyIdOf, secretToHex, storePrefixFor } from './identity'
import type { EngineCalls, EngineEvent, EngineOp } from './protocol'
import { noPaymentsRail, type PageRail } from './rail'
import { identitySecretState, subscribeIdentitySecret } from './secret'
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
}

const notReady = () => Promise.reject(new Error('Paykit is not ready'))

export const PaykitContext = createContext<PaykitContextValue>({
  status: 'off',
  homeserver: paykitConfig.homeserver,
  dispatchOrigin: paykitConfig.dispatchOrigin,
  retry: () => {},
  call: notReady,
  subscribe: () => () => {},
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
  // The rail the engine calls. Paying and verifying plug in here once they are wired to the wallet.
  const railRef = useRef<PageRail>(noPaymentsRail)

  useEffect(() => {
    if (!paykitConfig.enabled) return setState({ status: 'off' })
    if (secretState.kind === 'none') return setState({ status: 'locked' })
    if (secretState.kind === 'unsupported') return setState({ status: 'unsupported' })

    const secret = secretState.secret.slice()
    const ownIdentity = pubkyIdOf(secret)
    const abort = new AbortController()
    const homeserver = createHomeserver(paykitConfig, secret, ownIdentity)
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

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

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

  const value = useMemo<PaykitContextValue>(
    () => ({
      ...state,
      homeserver: paykitConfig.homeserver,
      dispatchOrigin: paykitConfig.dispatchOrigin,
      retry,
      call,
      subscribe,
    }),
    [state, retry, call, subscribe],
  )

  return <PaykitContext.Provider value={value}>{children}</PaykitContext.Provider>
}
