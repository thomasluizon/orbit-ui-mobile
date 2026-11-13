import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture as block } from '@orbit/shared/test-support/chat-fixtures'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { QuestionBlock } from '@/components/chat/question-block'

afterEach(cleanup)
const interaction = (): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(async () => ({ ok: true as const })) })
const optionGroup = (prompt: string) => document.querySelector<HTMLElement>(`[data-option-group][aria-label="${prompt}"]`)!
const element = (send: BlockAnswerInteraction, locale = 'en') => <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><QuestionBlock block={block} interaction={send} /></NextIntlClientProvider>

async function answerEverything(quick: boolean) {
  const send = interaction()
  resetTestFlags()
  if (quick) enableTestFlags('orbit_guided_flows')
  render(element(send))
  const choose = (prompt: string, name: RegExp | string) => quick
    ? fireEvent.click(within(optionGroup(prompt)).getByRole('button', { name }))
    : fireEvent.click(within(screen.getByRole('radiogroup', { name: prompt })).getByRole('radio', { name }))
  choose('When?', /Morning/)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Walking' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading' }))
  fireEvent.change(screen.getAllByLabelText(en.chat.choice.freeText)[1]!, { target: { value: 'Swimming' } })
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'How much energy?' })).getByRole('radio', { name: '3' }))
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
  for (let index = 0; index < 3; index++) fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  choose('Add a reminder?', en.common.no)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.chat.choice.submit })) })
  return send.send as ReturnType<typeof vi.fn>
}

it('answers a single-choice and a yes or no question with quick options that send the payload the radio list sends', async () => {
  const quick = await answerEverything(true)
  cleanup()
  const list = await answerEverything(false)
  expect(quick).toHaveBeenCalledTimes(1)
  expect(quick.mock.calls[0]).toEqual(list.mock.calls[0])
})

it('marks the pressed quick option as selected and leaves the other one unselected', () => {
  enableTestFlags('orbit_guided_flows')
  render(element(interaction()))
  const when = optionGroup('When?')
  fireEvent.click(within(when).getByRole('button', { name: /Morning/ }))
  expect(within(when).getByRole('button', { name: /Morning/ })).toHaveAttribute('aria-pressed', 'true')
  expect(within(when).getAllByRole('button').filter(option => option.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
})

it('moves focus between quick options with the arrow keys and selects only on a press', () => {
  enableTestFlags('orbit_guided_flows')
  render(element(interaction()))
  const options = within(optionGroup('When?')).getAllByRole('button')
  options[0]!.focus()
  fireEvent.keyDown(options[0]!, { key: 'ArrowRight' })
  expect(options[1]).toHaveFocus()
  expect(options.every(option => option.getAttribute('aria-pressed') === 'false')).toBe(true)
})

it('keeps the radio list while the flag is off', () => {
  render(element(interaction()))
  expect(screen.getByRole('radiogroup', { name: 'When?' })).toBeInTheDocument()
  expect(document.querySelector('[data-option-group]')).toBeNull()
})
