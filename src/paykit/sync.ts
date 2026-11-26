import { consoleError } from '../lib/logs'
import { readContacts } from '../lib/contacts'
import { pubkyIdOfContact, readConnections, writeConnections, type Connection, type ConnectionRecord } from './contacts'
import {
  PaykitCallError,
  type EngineCalls,
  type EngineEvent,
  type EngineOp,
  type OneTimeRequest,
  type PayeeRequest,
  type ReceivedList,
  type SharedList,
} from './protocol'
import { lastCheckOf, readSent, rememberSent } from './receive'
import { listEndpointsFor, sameListEndpoints } from './lists'

type Call = <O extends EngineOp>(op: O, args: EngineCalls[O]['args']) => Promise<EngineCalls[O]['result']>

/** What the page shows of Paykit's contacts and incoming requests. */
export interface PaykitSnapshot {
  /** Per Pubky contact (z-base-32): pending until the contact admits this wallet too. */
  connections: Record<string, Connection>
  /** The Payment Requests this wallet holds as payer, newest first. */
  requests: OneTimeRequest[]
  /** `requests` has been read from the engine at least once since it started. */
  requestsLoaded: boolean
  /** The Payment Requests this wallet sent as payee, and payments received, in the engine's order. */
  activity: PayeeRequest[]
  /** `activity` has been read from the engine at least once since it started. */
  activityLoaded: boolean
  /** Per activity record: where the check of a payer's proof stands. */
  checks: Record<string, ProofCheck>
  /** The Private Payment List this wallet shares, and with whom; `null` until it was read. */
  sharedList: SharedList | null
  /** The Private Payment Lists contacts shared with this wallet, the latest per contact app. */
  receivedLists: ReceivedList[]
  /** Both lists have been read from the engine at least once since it started. */
  listsLoaded: boolean
}

/**
 * Where the wallet's check of a proof stands, for an activity record in `proofReceived`:
 * - `checking`: the payment is not found on-chain yet (or esplora did not answer); it is checked again;
 * - `short`: the transaction pays the address less than requested; not confirmed, no receipt;
 * - `refused`: the engine refused the payment (such as a payment time before the request);
 * - `confirmed`: verified, and the receipt sent.
 */
export interface ProofCheck {
  state: 'checking' | 'short' | 'refused' | 'confirmed'
  txid?: string
  receivedSats?: number
  reason?: string
}

const EMPTY: PaykitSnapshot = {
  connections: {},
  requests: [],
  requestsLoaded: false,
  activity: [],
  activityLoaded: false,
  checks: {},
  sharedList: null,
  receivedLists: [],
  listsLoaded: false,
}

/** How long to wait before sharing the details with a contact again after the engine refused or failed. */
const SHARE_RETRY_MS = 15_000

/** How soon a proof is checked again: soon while the payment is not found, rarely once it is known short. */
const RECHECK_MS = { checking: 5_000, short: 60_000, refused: 60_000 } as const

/** How often the contacts are checked while one waits to be admitted, or the requests are not read yet. */
const TICK_MS = 3_000

const requestKey = (request: OneTimeRequest) => `${request.id.payee}/${request.id.requestHash}`
const listKey = (list: ReceivedList) => `${list.payee}/${list.appId}`

/**
 * Keeps the wallet's Pubky contacts and the engine in step while the engine runs, and holds what the page
 * shows of them:
 *
 * - every saved Pubky contact is allowed (`allowConnect`) once per engine start, so it may send this wallet
 *   Payment Requests;
 * - for each contact not known to admit this wallet, one admission probe (`probeAdmission`) is kept, and its
 *   delivery is read every few seconds (`messageDelivery`). `accepted`, or any message from the contact,
 *   marks it connected, which is remembered;
 * - the incoming Payment Requests are read once (`requests`) and then followed by their events;
 * - the wallet's private payment details (its Private Payment List: the boarding address as
 *   `btc-regtest-p2tr`) are set once the wallet's address is known, and shared with each contact once it is
 *   connected (`publishListTo`). The lists contacts share back are read once and followed by `listReceived`.
 *
 * The engine's own feed loop receives, sends and runs the signer meanwhile; this adds no loop of its own
 * beyond the probe reads.
 */
export class PaykitSync {
  private snapshot: PaykitSnapshot = EMPTY
  private readonly listeners = new Set<() => void>()
  private records: Record<string, ConnectionRecord>
  private allowed = new Set<string>()
  private timer?: ReturnType<typeof setTimeout>
  private ticking = false
  private stopped = false
  /** Records whose proof is being checked now, and when each may be checked again. */
  private confirming = new Set<string>()
  private nextCheck = new Map<string, number>()
  /** When sharing the details with a contact may be tried again, after a refusal or a failure. */
  private nextShare = new Map<string, number>()
  private unsubscribe: () => void

  /**
   * `listAddress` gives the address the wallet shares privately (its boarding address), or `undefined` while
   * the wallet is not unlocked.
   */
  constructor(
    private readonly ownId: string,
    private readonly call: Call,
    subscribe: (listener: (event: EngineEvent) => void) => () => void,
    private readonly listAddress: () => Promise<string | undefined>,
  ) {
    this.records = readConnections(ownId)
    this.unsubscribe = subscribe((event) => this.onEvent(event))
    this.publish({ connections: this.connectionsOf(this.contactIds()) })
  }

  /** Starts following the engine (it is started). */
  start(): void {
    this.stopped = false
    void this.tick()
  }

  /** Reads the contacts again now, such as right after one was saved. */
  refresh(): void {
    this.publish({ connections: this.connectionsOf(this.contactIds()) })
    void this.tick()
  }

  stop(): void {
    this.stopped = true
    this.unsubscribe()
    if (this.timer) clearTimeout(this.timer)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PaykitSnapshot => this.snapshot

  private publish(change: Partial<PaykitSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change }
    this.listeners.forEach((listener) => listener())
  }

  private contactIds(): string[] {
    const ids = readContacts()
      .map((contact) => pubkyIdOfContact(contact.address))
      .filter((id): id is string => id !== undefined && id !== this.ownId)
    return [...new Set(ids)]
  }

  private connectionsOf(ids: string[]): Record<string, Connection> {
    return Object.fromEntries(ids.map((id) => [id, this.records[id]?.connectedAtMs ? 'connected' : 'pending']))
  }

  private remember(id: string, record: ConnectionRecord) {
    this.records = { ...this.records, [id]: record }
    writeConnections(this.ownId, this.records)
  }

  private markConnected(id: string) {
    if (this.records[id]?.connectedAtMs) return
    this.remember(id, { ...this.records[id], connectedAtMs: Date.now() })
    this.publish({ connections: this.connectionsOf(this.contactIds()) })
  }

  private async tick() {
    if (this.stopped || this.ticking) return
    this.ticking = true
    if (this.timer) clearTimeout(this.timer)
    try {
      const ids = this.contactIds()
      for (const id of ids) {
        if (this.stopped) return
        await this.follow(id)
      }
      this.publish({ connections: this.connectionsOf(ids) })
      if (!this.snapshot.requestsLoaded) await this.loadRequests()
      if (!this.snapshot.activityLoaded) await this.loadActivity()
      if (!this.snapshot.listsLoaded) await this.loadLists()
      await this.shareDetails(ids)
      this.confirmDue()
    } finally {
      this.ticking = false
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), TICK_MS)
    }
  }

  /** Allows the contact once per start, and while it is pending, probes whether it admits this wallet. */
  private async follow(id: string) {
    try {
      if (!this.allowed.has(id)) {
        await this.call('allowConnect', id)
        this.allowed.add(id)
      }
      const record = this.records[id] ?? {}
      if (record.connectedAtMs) return
      if (!record.probeMsgId) {
        this.remember(id, { ...record, probeMsgId: await this.call('probeAdmission', id) })
      }
      const delivery = await this.call('messageDelivery', this.records[id].probeMsgId as string)
      if (delivery === 'accepted') this.markConnected(id)
      // Unknown to these stores (such as after a reset) or given up: probe again at the next tick.
      else if (delivery === null || delivery === 'failed')
        this.remember(id, { ...this.records[id], probeMsgId: undefined })
    } catch (error) {
      consoleError(error, 'Paykit could not check a contact')
    }
  }

  private async loadRequests() {
    try {
      const requests = await this.call('requests', undefined)
      const known = new Set(this.snapshot.requests.map(requestKey))
      // Requests told by events while the read ran stay first; the rest keep the engine's order.
      const merged = [...this.snapshot.requests, ...requests.filter((request) => !known.has(requestKey(request)))]
      this.publish({ requests: merged, requestsLoaded: true })
    } catch {
      // The app's first listing may not be done yet: read again at the next tick.
    }
  }

  private async loadActivity() {
    try {
      const activity = await this.call('payeeActivity', undefined)
      const known = new Set(this.snapshot.activity.map((item) => item.record))
      this.publish({
        activity: [...this.snapshot.activity, ...activity.filter((item) => !known.has(item.record))],
        activityLoaded: true,
      })
    } catch {
      // Read again at the next tick.
    }
  }

  private async loadLists() {
    try {
      const [sharedList, receivedLists] = await Promise.all([
        this.call('sharedList', undefined),
        this.call('receivedLists', undefined),
      ])
      // Lists told by events while the reads ran are newer than what the reads gave.
      const known = new Set(this.snapshot.receivedLists.map(listKey))
      this.publish({
        sharedList: this.snapshot.sharedList ?? sharedList,
        receivedLists: [...this.snapshot.receivedLists, ...receivedLists.filter((list) => !known.has(listKey(list)))],
        listsLoaded: true,
      })
    } catch {
      // Read again at the next tick.
    }
  }

  /**
   * Keeps the wallet's private payment details current and shared with every connected contact. The details
   * are the boarding address, which stays the same while the Executor is off (the demo runs it off); if it
   * ever changes, the new list goes to everyone it was shared with (the engine sends each change).
   *
   * For auditing: the list travels end-to-end encrypted to the contact's inbox only (pubky-noise inside the
   * engine); nothing of it is published on the Homeserver. A contact receives it only once both sides admit
   * each other.
   */
  private async shareDetails(ids: string[]) {
    if (this.stopped || !this.snapshot.listsLoaded) return
    const connected = ids.filter((id) => this.records[id]?.connectedAtMs)
    if (!connected.length) return
    try {
      const address = await this.listAddress()
      if (!address) return
      const endpoints = listEndpointsFor(address)
      if (!sameListEndpoints(this.snapshot.sharedList?.endpoints ?? null, endpoints)) {
        await this.call('setListEndpoints', endpoints)
        this.publish({ sharedList: await this.call('sharedList', undefined) })
      }
    } catch (error) {
      consoleError(error, 'Paykit could not set the private payment details')
      return
    }
    const now = Date.now()
    for (const id of connected) {
      if (this.stopped) return
      if (this.snapshot.sharedList?.recipients.includes(id)) continue
      if ((this.nextShare.get(id) ?? 0) > now) continue
      try {
        await this.call('publishListTo', id)
        this.nextShare.delete(id)
        this.publish({ sharedList: await this.call('sharedList', undefined) })
      } catch (error) {
        // `notNow`: an earlier publication to this contact is still unresolved; the engine sends it later.
        if (!(error instanceof PaykitCallError && error.reason === 'notNow')) {
          consoleError(error, 'Paykit could not share the private payment details')
        }
        this.nextShare.set(id, now + SHARE_RETRY_MS)
      }
    }
  }

  private upsertList(list: ReceivedList) {
    const key = listKey(list)
    const rest = this.snapshot.receivedLists.filter((item) => listKey(item) !== key)
    this.publish({ receivedLists: [list, ...rest] })
  }

  private upsertActivity(activity: PayeeRequest) {
    const known = this.snapshot.activity.some((item) => item.record === activity.record)
    this.publish({
      activity: known
        ? this.snapshot.activity.map((item) => (item.record === activity.record ? activity : item))
        : [activity, ...this.snapshot.activity],
    })
    this.confirmDue()
  }

  private setCheck(record: string, check: ProofCheck) {
    this.publish({ checks: { ...this.snapshot.checks, [record]: check } })
  }

  /**
   * Confirms each payment whose proof arrived: the engine verifies it with the rail (on-chain) and sends the
   * payer a receipt. A proof that does not verify yet is checked again a little later; one that pays too
   * little is shown as such and checked again only rarely. The user does not approve receipts one by one: a
   * verified payment is what was asked for.
   */
  private confirmDue() {
    if (this.stopped) return
    const now = Date.now()
    for (const activity of this.snapshot.activity) {
      if (activity.status !== 'proofReceived' || activity.divergent) continue
      const { record } = activity
      if (this.confirming.has(record) || (this.nextCheck.get(record) ?? 0) > now) continue
      this.confirming.add(record)
      void this.confirm(activity).finally(() => this.confirming.delete(record))
    }
  }

  private async confirm(activity: PayeeRequest) {
    const { record } = activity
    const retry = (state: keyof typeof RECHECK_MS) => this.nextCheck.set(record, Date.now() + RECHECK_MS[state])
    try {
      const receipt = await this.call('confirmPayment', record)
      if (this.stopped) return
      const check = lastCheckOf(activity.attemptId)
      if (receipt) {
        this.nextCheck.delete(record)
        const sent = activity.requestHash ? readSent(this.ownId)[activity.requestHash] : undefined
        if (sent && check?.kind === 'verified') {
          rememberSent(this.ownId, {
            ...sent,
            txid: check.txid,
            receivedSats: check.receivedSats,
            paidAtMs: check.paidAtMs,
          })
        }
        this.setCheck(record, {
          state: 'confirmed',
          txid: check?.kind === 'verified' ? check.txid : undefined,
          receivedSats: check?.kind === 'verified' ? check.receivedSats : undefined,
        })
        return
      }
      if (check?.kind === 'short') {
        retry('short')
        this.setCheck(record, { state: 'short', txid: check.txid, receivedSats: check.receivedSats })
      } else if (check?.kind === 'invalid') {
        retry('refused')
        this.setCheck(record, { state: 'refused', reason: check.reason })
      } else {
        retry('checking')
        this.setCheck(record, { state: 'checking', txid: check?.kind === 'notFound' ? check.txid : undefined })
      }
    } catch (error) {
      if (this.stopped) return
      if (error instanceof PaykitCallError && error.code === 'refused') {
        retry('refused')
        this.setCheck(record, { state: 'refused', reason: error.reason })
      } else {
        // The rail could not check now (esplora down), or the engine was busy: check again soon.
        consoleError(error, 'Paykit could not check a payment')
        retry('checking')
        this.setCheck(record, { ...this.snapshot.checks[record], state: 'checking' })
      }
    }
  }

  private upsertRequest(request: OneTimeRequest) {
    const key = requestKey(request)
    const rest = this.snapshot.requests.filter((item) => requestKey(item) !== key)
    const known = rest.length !== this.snapshot.requests.length
    const requests = known
      ? this.snapshot.requests.map((item) => (requestKey(item) === key ? request : item))
      : [request, ...rest]
    this.publish({ requests })
  }

  private onEvent(event: EngineEvent) {
    switch (event.type) {
      case 'started':
        // A restarted engine tells nothing it held at start: read the state again.
        this.allowed = new Set()
        this.nextCheck.clear()
        this.nextShare.clear()
        this.publish({
          requestsLoaded: false,
          activityLoaded: false,
          listsLoaded: false,
          sharedList: null,
          receivedLists: [],
        })
        void this.tick()
        return
      case 'messageReceived':
        // A contact that could send to this wallet has admitted it, and its Dispatch granted a reply.
        if (this.contactIds().includes(event.sender)) this.markConnected(event.sender)
        return
      case 'requestReceived':
      case 'requestUpdated':
      case 'receiptReceived':
        this.upsertRequest(event.request)
        return
      case 'proofReceived':
      case 'activityUpdated':
        this.upsertActivity(event.activity)
        return
      case 'listReceived':
        this.upsertList(event.list)
        return
      case 'sharedListUpdated':
        this.publish({ sharedList: event.list })
        return
    }
  }
}
