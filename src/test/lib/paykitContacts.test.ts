import { afterEach, describe, expect, it } from 'vitest'
import { isReusableContact, readContacts, saveContact } from '../../lib/contacts'
import { btcToSats, parsePubkyId, pubkyIdOfContact } from '../../paykit/contacts'

const id = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'

describe('Paykit contacts', () => {
  afterEach(() => localStorage.clear())

  it('reads a Pubky ID with or without a prefix, in any case', () => {
    expect(parsePubkyId(id)).toBe(id)
    expect(parsePubkyId(`pubky${id}`)).toBe(id)
    expect(parsePubkyId(` pk:${id.toUpperCase()} `)).toBe(id)
  })

  it('refuses what is not a Pubky ID', () => {
    expect(parsePubkyId('pubky-not-an-identity')).toBeUndefined()
    expect(parsePubkyId(id.slice(1))).toBeUndefined()
    // 52 characters whose last one carries bits past the 32-byte key.
    expect(parsePubkyId(`${id.slice(0, 51)}b`)).toBeUndefined()
    expect(parsePubkyId(`${id.slice(0, 50)}0y`)).toBeUndefined()
  })

  it('saves a Pubky contact under its pubky address', () => {
    expect(isReusableContact(id)).toBe(true)
    expect(saveContact(`  pk:${id}`, 'Alice')).toBe(true)
    const [contact] = readContacts()
    expect(contact.address).toBe(`pubky${id}`)
    expect(contact.name).toBe('Alice')
    expect(pubkyIdOfContact(contact.address)).toBe(id)
    expect(pubkyIdOfContact('bc1qexample')).toBeUndefined()
  })

  it('converts BTC amounts to sats without floats', () => {
    expect(btcToSats('0.00012500')).toBe(12_500)
    expect(btcToSats('1')).toBe(100_000_000)
    expect(btcToSats('0.1')).toBe(10_000_000)
    expect(btcToSats('0.000000001')).toBeUndefined()
    expect(btcToSats('-1')).toBeUndefined()
    expect(btcToSats('abc')).toBeUndefined()
  })
})
