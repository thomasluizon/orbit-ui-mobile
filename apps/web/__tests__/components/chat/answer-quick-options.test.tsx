import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { choiceBlockFixture, pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'

afterEach(() => { cleanup() })

type Locale = 'en' | 'pt-BR'
const plainChoice = { ...choiceBlockFixture, options: choiceBlockFixture.options.map(option => ({ ...option, description: null })) }
const SHORT_LABELS = ['Caminhar cedo', 'Beber água', 'Ler na pausa']
const longPickList = { ...pickListBlockFixture, items: pickListBlockFixture.items.slice(0, 3).map(item => ({ ...item, detail: null })) }
const plainPickList = { ...longPickList, items: longPickList.items.map((item, index) => ({ ...item, label: SHORT_LABELS[index]! })) }
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

describe('the list presentation the conversation blocks keep', () => {

  it('keeps the check list for a pick list whose labels hold more than 4 words', () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PickListBlock block={longPickList} interaction={interaction()} /></NextIntlClientProvider>)
    expect(cards()).toHaveLength(0)
    expect(screen.getAllByRole('checkbox')).toHaveLength(longPickList.items.length)
  })

  it('marks one pressed option of a single choice and toggles several of a multiple choice', () => {
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
