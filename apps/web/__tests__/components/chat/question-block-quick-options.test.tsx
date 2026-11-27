import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture as block, questionAnswersFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { QuestionBlock } from '@/components/chat/question-block'
import { canReloadDesktopWeb } from '@/lib/desktop-web-release'

afterEach(cleanup)
const interaction = (): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(async () => ({ ok: true as const })) })
const question = (prompt: string) => document.querySelector(`[data-question-invalid][aria-label="${prompt}"]`)
const optionGroup = (prompt: string) => document.querySelector<HTMLElement>(`[data-option-group][aria-label="${prompt}"]`)!
const element = (send: BlockAnswerInteraction, locale = 'en') => <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><QuestionBlock block={block} interaction={send} /></NextIntlClientProvider>

function answerEverything(send: BlockAnswerInteraction) {
  render(element(send))
  const next = () => fireEvent.click(screen.getByRole('button', { name: en.chat.question.next }))
  const choose = (prompt: string, name: RegExp | string) => fireEvent.click(within(optionGroup(prompt)).getByRole('button', { name }))
  choose('When?', /Morning/)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Walking' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading' }))
  fireEvent.change(screen.getAllByLabelText(en.chat.choice.freeText).at(0)!, { target: { value: 'Swimming' } })
  next()
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'How much energy?' })).getByRole('radio', { name: '3' }))
  next()
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
  for (let index = 0; index < 3; index++) fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  next()
  choose('Add a reminder?', en.common.no)
}
const submit = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: en.chat.choice.submit })) })

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

it('sends every typed answer once through the owning registry, then locks and shows the chosen values', async () => {
  const send = interaction()
  answerEverything(send)
  expect(canReloadDesktopWeb()).toBe(false)
  await submit()
  expect(send.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'question', answer: { blockId: block.blockId, selectedIds: [], answers: questionAnswersFixture } }))
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  const settled = screen.getByText(/You chose When\?: Morning/)
  expect(settled.parentElement).toHaveFocus()
  expect(settled).toHaveTextContent('Add a reminder?: No')
  expect(canReloadDesktopWeb()).toBe(true)
})

it('blocks a second submit while the first answer is sending, disables every input and keeps the answers for a retry', async () => {
  let finish!: (value: { ok: false; status: number }) => void
  const send = { ...interaction(), send: vi.fn<BlockAnswerInteraction['send']>(() => new Promise(resolve => { finish = resolve })) }
  answerEverything(send)
  await submit()
  await submit()
  expect(send.send).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('textbox').every(input => input.hasAttribute('disabled'))).toBe(true)
  await act(async () => { finish({ ok: false, status: 500 }) })
  expect(screen.getByText(en.chat.choice.error)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: en.chat.choice.submit })).not.toBeDisabled()
  expect(within(optionGroup('Add a reminder?')).getByRole('button', { name: en.common.no })).toHaveAttribute('aria-pressed', 'true')
})

it('links the required hint to the first unanswered question, focuses it and sends nothing', async () => {
  const send = interaction()
  render(element(send))
  fireEvent.click(screen.getByRole('button', { name: en.chat.question.next }))
  fireEvent.click(screen.getByRole('button', { name: en.chat.question.next }))
  await submit()
  const first = question('When?') as HTMLElement
  expect(first).toHaveAttribute('aria-invalid', 'true')
  expect(first).toHaveAttribute('aria-describedby', expect.stringContaining('-hint'))
  expect(document.getElementById(first.getAttribute('aria-describedby')!)).toHaveTextContent(en.chat.question.required)
  expect(within(first).getAllByRole('button')[0]).toHaveFocus()
  expect(send.send).not.toHaveBeenCalled()
})
