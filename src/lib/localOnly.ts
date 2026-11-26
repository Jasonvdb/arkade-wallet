/**
 * A local-only run: the dev server opened on a loopback host name, which is also what selects the
 * local regtest Arkade server (see `defaultArkServer`). Nothing in such a run should reach a public
 * service, so the price feed, the price chart and public Nostr relays are skipped. Unit tests run on
 * jsdom's `localhost` too, so they are left out.
 */
export const isLocalOnly = (): boolean => {
  if (import.meta.env.MODE === 'test') return false
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/** True for a ws/wss/http(s) URL on a loopback host. */
export const isLoopbackUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}
