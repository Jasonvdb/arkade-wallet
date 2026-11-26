import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import LoadingLogo from '../../components/LoadingLogo'
import Padded from '../../components/Padded'
import QrCode from '../../components/QrCode'
import Table, { type TableData } from '../../components/Table'
import Text, { TextSecondary } from '../../components/Text'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import CheckMarkIcon from '../../icons/CheckMark'
import CopyIcon from '../../icons/Copy'
import { prettyLongText } from '../../lib/format'
import { hapticSubtle } from '../../lib/haptics'
import { useTranslation } from '../../providers/language'
import Header from '../../screens/Settings/Header'
import { pubkyUri } from '../identity'
import { PaykitContext, type PaykitStatus } from '../provider'

const STATUS_TEXT: Record<PaykitStatus, string> = {
  off: 'Off',
  locked: 'Locked',
  unsupported: 'Needs a recovery phrase',
  waiting: 'Paused',
  starting: 'Connecting',
  ready: 'Active',
  restarting: 'Reconnecting',
  error: 'Unavailable',
}

const HOMESERVER_TEXT = { fake: 'Local test server', staging: 'Pubky staging' }

function Placeholder({ status, onRetry }: { status: PaykitStatus; onRetry: () => void }) {
  if (status === 'starting' || status === 'restarting') {
    return <LoadingLogo text={status === 'starting' ? 'Setting up your Pubky identity' : 'Reconnecting to Pubky'} />
  }
  const [title, body] =
    status === 'waiting'
      ? [
          'Active in another tab',
          'Your Pubky identity is active in another tab of this wallet. Close it to use it here.',
        ]
      : status === 'unsupported'
        ? [
            'Needs a recovery phrase',
            'This wallet was restored from a private key. A Pubky identity is derived from a recovery phrase.',
          ]
        : [
            'Pubky identity unavailable',
            'Your Pubky identity could not be set up. Check your connection and try again.',
          ]
  return (
    <FlexCol centered gap='0.5rem' padding='2rem 0'>
      <Text bold centered wrap>
        {title}
      </Text>
      <TextSecondary centered>{body}</TextSecondary>
      {status === 'error' ? (
        <FlexCol padding='1rem 0 0 0'>
          <Button label='Try again' onClick={onRetry} testId='paykit-retry' />
        </FlexCol>
      ) : null}
    </FlexCol>
  )
}

/**
 * The wallet's Pubky identity: the Pubky ID contacts use to find this wallet, as a QR code and text, and
 * whether Paykit is registered with the Pubky Dispatch.
 */
export default function PubkyIdentity() {
  const { status, identity, enrolment, appId, error, homeserver, retry } = useContext(PaykitContext)
  const { t } = useTranslation()
  const copyToClipboard = useCopyToClipboard()
  const prefersReducedMotion = useReducedMotion()

  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const ready = status === 'ready' && Boolean(identity)
  const pubkyId = identity ? pubkyUri(identity) : ''

  const handleCopy = async () => {
    if (!pubkyId) return
    if (!prefersReducedMotion) hapticSubtle()
    if (await copyToClipboard(pubkyId)) setCopied(true)
  }

  const details: TableData = [
    ['Status', STATUS_TEXT[status]],
    ['Pubky Dispatch', ready ? (enrolment === 'new' ? 'Registered just now' : 'Registered') : undefined],
    ['Homeserver', HOMESERVER_TEXT[homeserver]],
  ]

  return (
    <>
      <Header text={t('settings.pubkyIdentity')} back />
      <Content>
        <Padded>
          <FlexCol gap='1.25rem' centered>
            <TextSecondary centered>
              Contacts use your Pubky ID to find this wallet and send you payment requests.
            </TextSecondary>
            {ready ? (
              <>
                <div className='w-full max-w-85 aspect-square overflow-hidden rounded-3xl border border-neutral-100'>
                  <button
                    type='button'
                    className='focusable block w-full cursor-pointer border-0 bg-transparent p-0'
                    onClick={handleCopy}
                    aria-label='Copy Pubky ID'
                    data-testid='paykit-identity-qr'
                  >
                    <QrCode value={pubkyId} />
                  </button>
                </div>
                <div className='flex max-w-full items-center gap-1'>
                  <span className='truncate font-mono text-sm' data-testid='paykit-identity' data-pubky={identity}>
                    {prettyLongText(pubkyId, 14)}
                  </span>
                  <button
                    type='button'
                    aria-label='Copy Pubky ID'
                    data-testid='paykit-identity-copy'
                    onClick={handleCopy}
                    className='flex size-8 shrink-0 items-center justify-center text-neutral-500 [&_svg]:size-5'
                  >
                    {copied ? <CheckMarkIcon /> : <CopyIcon />}
                  </button>
                </div>
              </>
            ) : (
              <Placeholder status={status} onRetry={retry} />
            )}
            <div
              className='w-full'
              data-testid='paykit-status'
              data-status={status}
              data-enrolment={ready ? enrolment : undefined}
              data-app-id={ready ? appId : undefined}
              data-error={status === 'error' ? error : undefined}
            >
              <Table data={details} variant='receipt' />
            </div>
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
