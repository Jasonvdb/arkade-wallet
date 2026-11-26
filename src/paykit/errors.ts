import { InsufficientFundsError } from '../lib/asp'
import { PaykitCallError } from './protocol'

/**
 * What the wallet says when a Paykit step fails. The screens never show an error's own message: the engine's
 * (`<code>: <text>`, `pkg/API.md` section 8), the wallet SDK's and the browser's are written for developers,
 * and the console keeps them. The words here depend on what the user was doing and on the engine's `code`.
 */
export type PaykitStep = 'pay' | 'prepare'

const FALLBACK: Record<PaykitStep, string> = {
  pay: 'The payment did not go through. Nothing was sent.',
  prepare: 'The payment could not be prepared. Check your connection and try again.',
}

/** Wallet copy for an engine `code`, or `undefined` when the step's own words fit better. */
const byCode = (code: string | undefined): string | undefined => {
  switch (code) {
    case 'store':
      return 'Your Pubky identity is open in another tab of this wallet. Close it and try again.'
    case 'busy':
    case 'not_started':
      return 'Your Pubky identity is still starting. Try again in a moment.'
    case 'signer':
    case 'enrolment':
    case 'identity_mismatch':
      return 'Your Pubky identity is not available right now. Try again in a moment.'
    case 'homeserver':
    case 'paykit':
      return 'The wallet could not reach Pubky. Check your connection and try again.'
    case 'conflict':
      return 'This request changed meanwhile. Open it again to see where it stands.'
    default:
      return undefined
  }
}

/** In words for the user, why `step` failed with `error`. */
export const paykitErrorText = (error: unknown, step: PaykitStep): string => {
  if (error instanceof InsufficientFundsError) return 'You do not have enough bitcoin ready to send for this payment.'
  if (error instanceof PaykitCallError) return byCode(error.code) ?? FALLBACK[step]
  return FALLBACK[step]
}
