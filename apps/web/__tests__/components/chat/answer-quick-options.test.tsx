import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { choiceBlockFixture, pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'

afterEach(() => { cleanup(); resetTestFlags() })

type Locale = 'en' | 'pt-BR'
const plainChoice = { ...choiceBlockFixture, options: choiceBlockFixture.options.map(option => ({ ...option, description: null })) }
const plainPickList = { ...pickListBlockFixture, items: pickListBlockFixture.items.slice(0, 3).map(item => ({ ...item, detail: null })) }
const interaction = (): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(async () => ({ ok: true as const })) })
const cards = () => [...document.querySelectorAll<HTMLButtonElement>('[data-option-card]')]
const submitLabel = (locale: Locale, kind: 'choice' | 'multi' | 'pick') => (locale === 'en' ? en : pt).chat.choice[kind === 'pick' ? 'review' : 'submit']

function mount(kind: 'choice' | 'multi' | 'pick', locale: Locale, send = interaction()) {
  render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
    {kind === 'pick' ? <PickListBlock block={plainPickList} interaction={send} /> : <ChoiceBlock block={{ ...plainChoice, multiSelect: kind === 'multi' }} interaction={send} />}
  </NextIntlClientProvider>)
  return send
}

async function answer(kind: 'choice' | 'multi' | 'pick', locale: Locale, quick: boolean) {
  resetTestFlags()
  if (quick) enableTestFlags('orbit_guided_flows')
  const send = mount(kind, locale)
  const labels = kind === 'pick' ? plainPickList.items.map(item => item.label) : plainChoice.options.map(option => option.label)
  const press = (label: string) => quick
    ? fireEvent.click(cards().find(card => card.textContent === label)!)
    : fireEvent.click(screen.getByRole(kind === 'choice' ? 'radio' : 'checkbox', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }))
  press(labels[1]!)
  if (kind !== 'choice') press(labels[0]!)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: submitLabel(locale, kind) })) })
  cleanup()
  return (send.send as ReturnType<typeof vi.fn>).mock.calls
}

describe.each(['pt-BR', 'en'] as const)('the quick options of the conversation blocks in %s', (locale) => {
  it.each(['choice', 'multi', 'pick'] as const)('answers a %s block of 2 to 4 options with OptionCard and sends the payload the list sends', async (kind) => {
    resetTestFlags()
    enableTestFlags('orbit_guided_flows')
    mount(kind, locale)
    expect(cards()).toHaveLength(kind === 'pick' ? 3 : plainChoice.options.length)
    expect(document.querySelector('[data-option-group]')).not.toBeNull()
    cleanup()
    const quick = await answer(kind, locale, true)
    const list = await answer(kind, locale, false)
    expect(quick).toHaveLength(1)
    expect(quick).toEqual(list)
  })
})

describe('the list presentation the conversation blocks keep', () => {
  it('keeps the radio list for an option with a detail line, and with the flag off', () => {
    enableTestFlags('orbit_guided_flows')
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><ChoiceBlock block={choiceBlockFixture} interaction={interaction()} /></NextIntlClientProvider>)
    expect(cards()).toHaveLength(0)
    expect(screen.getAllByRole('radio').length).toBe(choiceBlockFixture.options.length)
    cleanup()
    resetTestFlags()
    mount('choice', 'pt-BR')
    expect(cards()).toHaveLength(0)
  })

  it('marks one pressed option of a single choice and toggles several of a multiple choice', () => {
    enableTestFlags('orbit_guided_flows')
    mount('choice', 'pt-BR')
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!)
    expect(cards().map(card => card.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    cleanup()
    mount('multi', 'pt-BR')
    fireEvent.click(cards()[0]!)
    fireEvent.click(cards()[1]!)
    expect(cards().map(card => card.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false'])
  })
})
