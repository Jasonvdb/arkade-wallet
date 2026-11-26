import { useState } from 'react'
import ChevronDown from '../icons/ChevronDown'
import UsersRound from '../icons/UsersRound'
import { contactDisplayName, readContacts } from '../lib/contacts'
import { pubkyIdOfContact } from '../paykit/contacts'
import Button from './Button'
import SheetModal from './SheetModal'
import { useTranslation } from '../providers/language'

export default function ContactPicker({
  disabled,
  onSelect,
}: {
  disabled: boolean
  onSelect: (address: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // Pubky contacts are paid through their Payment Requests (Paykit), not by an address typed here.
  const contacts = readContacts().filter((contact) => !pubkyIdOfContact(contact.address))
  if (!contacts.length) return null
  return (
    <>
      <button type='button' className='contact-picker-trigger' onClick={() => setOpen(true)} disabled={disabled}>
        <UsersRound size={18} />
        <span>{t('contacts.title')}</span>
        <ChevronDown />
      </button>
      <SheetModal isOpen={open} onClose={() => setOpen(false)}>
        <h2>{t('contacts.sendTo')}</h2>
        <div className='contact-picker-list'>
          {contacts.map((contact) => (
            <button
              key={contact.address}
              type='button'
              className='contact-picker-item'
              onClick={() => {
                onSelect(contact.address)
                setOpen(false)
              }}
            >
              <strong>{contactDisplayName(contact) || contact.address}</strong>
              <span>{contact.address}</span>
              {contact.name ? <span>{t('contacts.sentTimes', { count: contact.sendCount })}</span> : null}
            </button>
          ))}
        </div>
        <Button label={t('common.cancel')} secondary onClick={() => setOpen(false)} />
      </SheetModal>
    </>
  )
}
