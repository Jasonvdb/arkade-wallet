import { consoleError } from '../lib/logs'
import { readContacts } from '../lib/contacts'
import { pubkyIdOfContact, readConnections, writeConnections, type Connection, type ConnectionRecord } from './contacts'
import type { EngineCalls, EngineEvent, EngineOp, OneTimeRequest } from './protocol'

type Call = <O extends EngineOp>(op: O, args: EngineCalls[O]['args']) => Promise<EngineCalls[O]['result']>

/** What the page shows of Paykit's contacts and incoming requests. */
export interface PaykitSnapshot {
  /** Per Pubky contact (z-base-32): pending until the contact admits this wallet too. */
  connections: Record<string, Connection>
  /** The Payment Requests this wallet holds as payer, newest first. */
  requests: OneTimeRequest[]
  /** `requests` has been read from the engine at least once since it started. */
  requestsLoaded: boolean
}

const EMPTY: PaykitSnapshot = { connections: {}, requests: [], requestsLoaded: false }

/** How often the contacts are checked while one waits to be admitted, or the requests are not read yet. */
const TICK_MS = 3_000

const requestKey = (request: OneTimeRequest) => `${request.id.payee}/${request.id.requestHash}`

/**
 * Keeps the wallet's Pubky contacts and the engine in step while the engine runs, and holds what the page
 * shows of them:
 *
 * - every saved Pubky contact is allowed (`allowConnect`) once per engine start, so it may send this wallet
 *   Payment Requests;
 * - for each contact not known to admit this wallet, one admission probe (`probeAdmission`) is kept, and its
 *   delivery is read every few seconds (`messageDelivery`). `accepted`, or any message from the contact,
 *   marks it connected, which is remembered;
 * - the incoming Payment Requests are read once (`requests`) and then followed by their events.
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
  private unsubscribe: () => void

  constructor(
    private readonly ownId: string,
    private readonly call: Call,
    subscribe: (listener: (event: EngineEvent) => void) => () => void,
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
        this.publish({ requestsLoaded: false })
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
    }
  }
}
