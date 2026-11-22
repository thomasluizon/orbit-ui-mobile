import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture as block } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { QuestionBlock } from '@/components/chat/question-block'

afterEach(cleanup)
const interaction = (): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(async () => ({ ok: true as const })) })
const question = (prompt: string) => document.querySelector(`[data-question-invalid][aria-label="${prompt}"]`)
const optionGroup = (prompt: string) => document.querySelector<HTMLElement>(`[data-option-group][aria-label="${prompt}"]`)!
const element = (send: BlockAnswerInteraction, locale = 'en') => <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><QuestionBlock block={block} interaction={send} /></NextIntlClientProvider>

async function answerEverything(quick: boolean) {
  const send = interaction()
  render(element(send))
  const next = () => { if (quick) fireEvent.click(screen.getByRole('button', { name: en.chat.question.next })) }
  const choose = (prompt: string, name: RegExp | string) => quick
    ? fireEvent.click(within(optionGroup(prompt)).getByRole('button', { name }))
    : fireEvent.click(within(screen.getByRole('radiogroup', { name: prompt })).getByRole('radio', { name }))
  choose('When?', /Morning/)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Walking' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading' }))
  fireEvent.change(screen.getAllByLabelText(en.chat.choice.freeText).at(quick ? 0 : 1)!, { target: { value: 'Swimming' } })
  next()
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'How much energy?' })).getByRole('radio', { name: '3' }))
  next()
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
  for (let index = 0; index < 3; index++) fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  next()
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

it('marks the pressed quick option as selected, moves to the next question, and keeps the answer on the way back', () => {
  render(element(interaction()))
  fireEvent.click(within(optionGroup('When?')).getByRole('button', { name: /Morning/ }))
  expect(question('When?')).toBeNull()
  expect(question('Which activities?')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.chat.question.previous }))
  const when = optionGroup('When?')
  expect(within(when).getByRole('button', { name: /Morning/ })).toHaveAttribute('aria-pressed', 'true')
  expect(within(when).getAllByRole('button').filter(option => option.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
})

it('shows one question in view with its position, in pt-BR too', () => {
  render(element(interaction(), 'pt-BR'))
  expect(document.querySelectorAll('[data-question-invalid]')).toHaveLength(1)
  expect(screen.getByText(`1 de ${block.questions.length}`)).toBeInTheDocument()
  expect(screen.queryByText(/perguntas respondidas/)).toBeNull()
  expect(screen.getByRole('button', { name: pt.chat.question.previous })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: pt.chat.question.next }))
  expect(screen.getByText(`2 de ${block.questions.length}`)).toBeInTheDocument()
  expect(document.querySelectorAll('[data-question-invalid]')).toHaveLength(1)
})

it('shows the first question that still needs an answer after a submit with gaps', async () => {
  const send = interaction()
  render(element(send))
  fireEvent.click(screen.getByRole('button', { name: en.chat.question.next }))
  fireEvent.click(screen.getByRole('button', { name: en.chat.question.next }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.chat.choice.submit })) })
  expect(send.send).not.toHaveBeenCalled()
  expect(question('When?')).not.toBeNull()
  expect(screen.getByText(`1 of ${block.questions.length}`)).toBeInTheDocument()
})

it('moves focus between quick options with the arrow keys and selects only on a press', () => {
  render(element(interaction()))
  const options = within(optionGroup('When?')).getAllByRole('button')
  options[0]!.focus()
  fireEvent.keyDown(options[0]!, { key: 'ArrowRight' })
  expect(options[1]).toHaveFocus()
  expect(options.every(option => option.getAttribute('aria-pressed') === 'false')).toBe(true)
})

it('keeps the radio list and every question in view while the flag is off', () => {
  render(element(interaction()))
  expect(screen.getByRole('radiogroup', { name: 'When?' })).toBeInTheDocument()
  expect(document.querySelector('[data-option-group]')).toBeNull()
  expect(document.querySelectorAll('[data-question-invalid]')).toHaveLength(block.questions.length)
  expect(screen.queryByRole('button', { name: en.chat.question.next })).toBeNull()
  expect(screen.getByText(`0 of ${block.questions.length} questions answered`)).toBeInTheDocument()
})

it('sets the recommended note under the quick options in the type of the Recommended line of the row layout', () => {
  render(element(interaction()))
  const note = within(question('When?') as HTMLElement).getByText(new RegExp(`: ${en.chat.placement.recommended}$`))
  expect(note).toHaveStyle({ fontSize: '14px', lineHeight: '1.4' })
})

it('moves focus to the new question and announces its position after a quick option answer advances', () => {
  render(element(interaction()))
  expect(document.body).toHaveFocus()
  fireEvent.click(within(optionGroup('When?')).getByRole('button', { name: /Morning/ }))
  expect(question('Which activities?')).toHaveFocus()
  expect(screen.getByText(`2 of ${block.questions.length}`)).toHaveAttribute('role', 'status')
})

it('moves focus to the new question after the previous and the next control, and never leaves it on a control that turns disabled', () => {
  render(element(interaction()))
  const next = () => screen.getByRole('button', { name: en.chat.question.next })
  for (let step = 1; step < block.questions.length; step++) {
    next().focus()
    fireEvent.click(next())
    expect(question(block.questions[step]!.prompt)).toHaveFocus()
  }
  expect(next()).toBeDisabled()
  expect(document.activeElement).not.toBe(next())
  const previous = screen.getByRole('button', { name: en.chat.question.previous })
  previous.focus()
  fireEvent.click(previous)
  expect(question(block.questions[block.questions.length - 2]!.prompt)).toHaveFocus()
})

it('leaves focus where it is while the flag is off and a single answer follows', () => {
  render(element(interaction()))
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'When?' })).getByRole('radio', { name: /Morning/ }))
  expect(document.body).toHaveFocus()
})

it('keeps the arrow keys working on a slider that the person reaches after the focus moved to its question', () => {
  render(element(interaction()))
  for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole('button', { name: en.chat.question.next }))
  const slider = screen.getByRole('slider')
  slider.focus()
  fireEvent.keyDown(slider, { key: 'Home' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThan(Number(slider.getAttribute('aria-valuemin')))
})

it('does not move focus when the flag turns on or off after the block mounted', () => {
  const outside = document.body.appendChild(document.createElement('button'))
  try {
    const view = render(element(interaction()))
    outside.focus()
    view.rerender(element(interaction()))
    expect(question('When?')).not.toBeNull()
    expect(outside).toHaveFocus()
    view.rerender(element(interaction()))
    expect(outside).toHaveFocus()
  } finally { outside.remove() }
})
