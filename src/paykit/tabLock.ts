/**
 * One tab runs the engine: its OPFS stores take exclusive locks, so a second tab's engine would fail to open
 * them. A Web Lock decides which tab it is; a later tab waits and takes over when the first one closes.
 */
const LOCK_NAME = 'paykit-engine'

export interface TabLock {
  release(): void
}

/** Resolves when this tab's previous holder (an engine being stopped) has let go. */
let ownRelease: Promise<void> = Promise.resolve()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const take = (options: LockOptions) =>
  new Promise<TabLock | null>((resolve, reject) => {
    let release: () => void = () => {}
    const held = new Promise<void>((done) => (release = done))
    navigator.locks
      .request(LOCK_NAME, options, (lock) => {
        if (!lock) {
          resolve(null)
          return undefined
        }
        ownRelease = held
        resolve({ release })
        return held // the lock stays held until release()
      })
      .catch(reject)
  })

/**
 * Resolves with the lock once this tab holds it. `onWaiting` is called when another tab holds it first.
 * Rejects with an `AbortError` when `signal` aborts before the lock is taken.
 */
export const acquireTabLock = async (signal: AbortSignal, onWaiting: () => void): Promise<TabLock> => {
  if (!navigator.locks) return { release() {} } // no Web Locks: nothing to coordinate with

  // An engine of this tab that is still stopping is not another tab.
  await ownRelease
  const first = (await take({ ifAvailable: true })) ?? (await sleep(200).then(() => take({ ifAvailable: true })))
  if (first) return first
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  onWaiting()
  const later = await take({ signal })
  if (!later) throw new DOMException('Aborted', 'AbortError')
  return later
}
