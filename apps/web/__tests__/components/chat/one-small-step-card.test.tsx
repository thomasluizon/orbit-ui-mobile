import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeHeldHabitMessage, makeOneSmallStepCard } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/chat/message-bubble'
import { measureClampedPersonalText } from '../../support/personal-text'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
afterEach(cleanup)

function mount(locale: 'en' | 'pt-BR' = 'en', blocked = false, long = false) {
  const card = makeOneSmallStepCard(locale)
  if (long) { card.suggestion.goal = 'Read a very long book '.repeat(8).trim(); card.suggestion.step = 'Open the first page of the book '.repeat(6).trim() }
  const send = vi.fn(async (_message: string) => {})
  const message = makeHeldHabitMessage({ content: '', pendingOperations: [], parts: [{ type: 'block', kind: 'oneSmallStep', block: card }] })
  render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><MessageBubble message={message} onSendMessage={send} blockAnswerInteraction={{ isOnline: !blocked, isSending: false, atMessageLimit: false, allowance: 10, send: vi.fn() }} /></NextIntlClientProvider>)
  return { card, send }
}

describe('one small step on web', () => {
  it.each(['en', 'pt-BR'] as const)('renders the goal, step and server-labelled actions in %s', locale => {
    const { card } = mount(locale)
    expect(screen.getByLabelText(card.suggestion.goal)).toBeInTheDocument()
    expect(screen.getByLabelText(card.suggestion.step)).toBeInTheDocument()
    for (const action of card.actions) expect(screen.getByRole('button', { name: action.label })).toBeEnabled()
  })
  it.each([0, 1, 2])('submits action %s as one chat message without an approval or record write', async index => {
    const { card, send } = mount()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: card.actions[index]!.label })) })
    expect(send).toHaveBeenCalledExactlyOnceWith(card.actions[index]!.message)
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })
  it('disables every action while offline', () => {
    const { card, send } = mount('en', true)
    for (const action of card.actions) { const button = screen.getByRole('button', { name: action.label }); expect(button).toBeDisabled(); fireEvent.click(button) }
    expect(send).not.toHaveBeenCalled()
  })
  it('discloses the full long goal and step with one tap each', async () => {
    const restore = measureClampedPersonalText()
    try {
      let card!: ReturnType<typeof makeOneSmallStepCard>
      await act(async () => { card = mount('en', false, true).card })
      expect(screen.getByRole('heading', { name: card.suggestion.goal })).toBeInTheDocument()
      for (const text of [card.suggestion.goal, card.suggestion.step]) {
        const button = screen.getByRole('button', { name: text === card.suggestion.goal ? en.common.showFullText.replace('{name}', text) : text })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        await act(async () => { fireEvent.click(button) })
        expect(button).toHaveAttribute('aria-expanded', 'true')
        if (text === card.suggestion.step) expect(document.querySelector(`[id="${button.getAttribute('aria-controls')}"]`)).toHaveAttribute('data-personal-text-expanded')
        else {
          expect(await screen.findByRole('dialog', { name: text })).toBeInTheDocument()
          await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.common.close })) })
        }
      }
    } finally { restore() }
  })
  it('retains replies without the block', () => {
    render(<NextIntlClientProvider locale="en" messages={en}><MessageBubble message={makeHeldHabitMessage({ content: 'Open the book.', pendingOperations: [] })} /></NextIntlClientProvider>)
    expect(screen.getByText('Open the book.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Smaller' })).not.toBeInTheDocument()
  })
})
