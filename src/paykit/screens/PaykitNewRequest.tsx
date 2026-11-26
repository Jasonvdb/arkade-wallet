import { useContext, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Content from '../../components/Content'
import ErrorMessage from '../../components/Error'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import InputAmount, { type InputAmountMode } from '../../components/InputAmount'
import InputContainer from '../../components/InputContainer'
import Padded from '../../components/Padded'
import Toggle from '../../components/Toggle'
import UsersRound from '../../icons/UsersRound'
import { canConvertCurrency, satsFromEntry, textFromSats } from '../../lib/format'
import { AspContext } from '../../providers/asp'
import { ConfigContext } from '../../providers/config'
import { FiatContext } from '../../providers/fiat'
import { NavigationContext, Pages } from '../../providers/navigation'
import { WalletContext } from '../../providers/wallet'
import { ConnectionStatus } from '../components/ContactsPaykit'
import { BOARDING_ENDPOINT } from '../config'
import { pubkyContactAddress } from '../contacts'
import { payeeName, shortPubky } from '../pay'
import { PaykitCallError } from '../protocol'
import { PaykitContext } from '../provider'
import { rememberSent, satsToBtc } from '../receive'
import '../../screens/Settings/Contacts.css'
import '../components/Paykit.css'

const initialFor = (label: string): string => label.trim().charAt(0).toUpperCase() || '?'

/** The note a request carries when the user leaves it empty (the payer sees it, the receipt copies it). */
const DEFAULT_NOTE = 'Payment request'
const NOTE_MAX = 120

/** A boarding address of the local regtest: Taproot, `bcrt1p...`. */
const BOARDING_ADDRESS = /^bcrt1p[02-9ac-hj-np-z]{58}$/

/** In words, why a request could not be sent. */
const sendError = (error: unknown, name: string): string => {
  if (error instanceof PaykitCallError && error.code === 'refused') {
    if (error.reason === 'heldForUser') return `${name} is blocked on this wallet.`
    if (error.reason === 'scopeMissing') return 'Your Pubky identity cannot send requests yet. Try again in a moment.'
    return 'The request could not be sent right now. Try again in a moment.'
  }
  return 'The request could not be sent. Check your connection and try again.'
}

/**
 * Asks a Pubky contact for money: an amount and an optional note. The request asks to be paid on-chain to
 * this wallet's boarding address (`btc-regtest-p2tr`), which the wallet boards by itself once paid. The
 * engine signs and sends it; the sent request's screen follows.
 */
export default function PaykitNewRequest() {
  const { requestContact, call, identity, data, focusSent, setReturnContact } = useContext(PaykitContext)
  const { svcWallet } = useContext(WalletContext)
  const { aspInfo } = useContext(AspContext)
  const { config, useFiat } = useContext(ConfigContext)
  const { fromFiat, toFiat, fiatDecimals } = useContext(FiatContext)
  const { replace } = useContext(NavigationContext)
  const [amountText, setAmountText] = useState('')
  // The amount in sats is what counts; the text follows the entry denomination (the wallet's unit or fiat).
  const [sats, setSats] = useState(0)
  const [mode, setMode] = useState<InputAmountMode>('unit')
  const [note, setNote] = useState('')
  // Ask to be paid to the private payment details already shared with this contact (destination `any`).
  const [usePrivate, setUsePrivate] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!requestContact || !identity) {
    return (
      <>
        <Header text='Request payment' back />
        <Content>
          <Padded>
            <div className='contact-empty' data-testid='paykit-new-request-missing'>
              <UsersRound size={24} />
              <h2>Choose a contact</h2>
              <p>Open a Pubky contact to ask them for a payment.</p>
            </div>
          </Padded>
        </Content>
      </>
    )
  }

  const name = payeeName(requestContact)
  const connection = data.connections[requestContact] ?? 'pending'
  const detailsShared = Boolean(data.sharedList?.recipients.includes(requestContact))
  const toPrivate = usePrivate && detailsShared
  const fiatEntry = mode === 'fiat' && useFiat && canConvertCurrency(config.currency, toFiat, fromFiat)
  const changeAmount = (text: string) => {
    setAmountText(text)
    setSats(text ? Math.round(satsFromEntry(Number(text), fiatEntry, config.unit, fromFiat)) : 0)
  }
  const changeMode = (next: InputAmountMode) => {
    setMode(next)
    const fiat = next === 'fiat' && useFiat && canConvertCurrency(config.currency, toFiat, fromFiat)
    if (sats) setAmountText(textFromSats(sats, fiat, config.unit, toFiat, fiatDecimals))
  }
  // An output below dust cannot be boarded; the operator's dust limit is the least worth asking for.
  const minimum = Math.max(Number(aspInfo.dust) || 0, 330)
  const tooSmall = sats > 0 && sats < minimum
  const canSend = sats >= minimum && Number.isSafeInteger(sats) && connection === 'connected' && !busy

  const send = async () => {
    if (!canSend || !svcWallet) return
    setBusy(true)
    setError('')
    try {
      const address = await svcWallet.getBoardingAddress()
      if (!BOARDING_ADDRESS.test(address)) throw new Error('not a regtest boarding address')
      const reference = note.trim() || DEFAULT_NOTE
      const sent = await call('sendRequest', {
        to: requestContact,
        amount: { value: satsToBtc(sats), asset: 'btc' },
        paymentReference: reference,
        // `any`: the request names no address; the payer pays the private details shared with it, which hold
        // this same boarding address.
        destination: toPrivate
          ? { type: 'any' }
          : {
              type: 'endpoints',
              endpoints: [{ identifier: BOARDING_ENDPOINT, payload: JSON.stringify({ value: address }) }],
            },
      })
      const requestHash = sent.request?.requestHash
      if (!requestHash) throw new Error('the engine kept no request')
      rememberSent(identity, {
        to: requestContact,
        requestHash,
        sats,
        note: reference,
        endpointId: BOARDING_ENDPOINT,
        address,
        destination: toPrivate ? 'any' : 'endpoints',
        createdAtMs: Date.now(),
        delivery: sent.delivery,
      })
      focusSent(requestHash)
      setReturnContact(pubkyContactAddress(requestContact))
      replace(Pages.PaykitSentRequest, [Pages.Settings, Pages.Wallet])
    } catch (err) {
      setError(sendError(err, name))
      setBusy(false)
    }
  }

  return (
    <>
      <Header text='Request payment' back />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <section className='contact-identity paykit-request-card' data-testid='paykit-new-request'>
              <span className='contact-avatar' aria-hidden='true'>
                {initialFor(name)}
              </span>
              <div className='contact-identity-copy'>
                <h2>{name}</h2>
                <span className='paykit-request-card__pubky'>{shortPubky(requestContact)}</span>
                <ConnectionStatus pill connection={connection} name={name} pubkyId={requestContact} />
              </div>
            </section>

            <div className='paykit-request-field' data-testid='paykit-request-amount'>
              <InputAmount
                label='Amount'
                name='paykit-request-amount'
                value={amountText}
                focus
                groupDigits
                switchable
                mode={mode}
                onModeChange={changeMode}
                min={tooSmall ? minimum : undefined}
                onChange={changeAmount}
                onEnter={send}
              />
            </div>
            <InputContainer label='Note (optional)' bottomRight={note.length ? `${note.length}/${NOTE_MAX}` : ''}>
              <input
                className='input'
                data-testid='paykit-request-memo'
                aria-label='Note'
                placeholder='What is it for?'
                maxLength={NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyUp={(event) => event.key === 'Enter' && send()}
              />
            </InputContainer>

            {detailsShared ? (
              <Toggle
                text='Use private payment details'
                subtext={`${name} pays to the details you shared privately. No address goes in the request.`}
                checked={toPrivate}
                onClick={() => setUsePrivate((on) => !on)}
                testId='paykit-request-any'
              />
            ) : null}

            <p className='paykit-contact-hint' data-testid='paykit-request-hint'>
              {connection !== 'connected'
                ? `${name} has not added you yet. You can ask for a payment once they do.`
                : toPrivate
                  ? `${name} pays on-chain to your private payment details. The payment shows in your balance as soon as it arrives.`
                  : `${name} pays on-chain to your bitcoin address. The payment shows in your balance as soon as it arrives.`}
            </p>

            <ErrorMessage error={Boolean(error)} text={error} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label='Send request' onClick={send} loading={busy} disabled={!canSend} testId='paykit-request-send' />
      </ButtonsOnBottom>
    </>
  )
}
