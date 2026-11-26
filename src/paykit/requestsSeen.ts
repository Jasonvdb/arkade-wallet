/**
 * When this wallet first saw each incoming Payment Request, for the dates on its lists: a one-time request
 * carries no creation time of its own. Keyed by `payee/requestHash`, per Pubky identity, in localStorage. A
 * request read again after the record was lost (another device, cleared storage) dates from that read.
 */
const seenKey = (ownId: string) => `paykit.requests-seen.v1.${ownId}`

export const readRequestsSeen = (ownId: string): Record<string, number> => {
  try {
    const stored = JSON.parse(localStorage.getItem(seenKey(ownId)) ?? '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    return {}
  }
}

/** Notes the requests not seen before as first seen at `nowMs`. Requests already noted keep their time. */
export const rememberRequestsSeen = (ownId: string, keys: string[], nowMs = Date.now()): void => {
  const seen = readRequestsSeen(ownId)
  const fresh = keys.filter((key) => seen[key] === undefined)
  if (!fresh.length) return
  for (const key of fresh) seen[key] = nowMs
  try {
    localStorage.setItem(seenKey(ownId), JSON.stringify(seen))
  } catch {
    // Storage full or blocked: a date on a list is a convenience, not a record anything depends on.
  }
}
