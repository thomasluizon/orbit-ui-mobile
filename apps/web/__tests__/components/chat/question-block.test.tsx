import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture as block, questionAnswersFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction, QuestionBlockProps } from '@orbit/shared/chat'
import { QuestionBlock } from '@/components/chat/question-block'
import { ChatBlock } from '@/components/chat/block-registry'
import { canReloadDesktopWeb } from '@/lib/desktop-web-release'
import { pressRadioKey } from '@/__tests__/support/radio-key'

afterEach(cleanup)
const interaction = (overrides: Partial<BlockAnswerInteraction> = {}): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(async () => ({ ok: true as const })), ...overrides })
function element(props: Partial<QuestionBlockProps> = {}, locale = 'en') {
  return <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><QuestionBlock block={block} interaction={interaction()} {...props} /></NextIntlClientProvider>
}
const group = (prompt: string) => screen.getByRole('radiogroup', { name: prompt })
async function submit() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.chat.choice.submit })) }) }
function complete() {
  fireEvent.click(within(group('When?')).getByRole('radio', { name: /Morning/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Walking' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reading' }))
  fireEvent.change(screen.getAllByLabelText(en.chat.choice.freeText)[1]!, { target: { value: 'Swimming' } })
  fireEvent.click(within(group('How much energy?')).getByRole('radio', { name: '3' }))
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
  for (let index = 0; index < 3; index++) fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  fireEvent.click(within(group('Add a reminder?')).getByRole('radio', { name: en.common.no }))
}

it.each(['en', 'pt-BR'])('renders all five types, a recommendation, end labels and both progress counts in %s', locale => {
  render(element({}, locale))
  const words = locale === 'en' ? en : pt
  expect(screen.getByText(words.chat.placement.recommended)).toBeInTheDocument()
  expect(screen.getByText(locale === 'en' ? '0 of 5 questions answered' : '0 de 5 perguntas respondidas')).toBeInTheDocument()
  expect(screen.getByText(locale === 'en' ? '2 of 8' : '2 de 8')).toBeInTheDocument()
  expect(screen.getAllByRole('radio').every(radio => radio.getAttribute('aria-checked') === 'false')).toBe(true)
  expect(within(group('How much energy?')).getAllByRole('radio')).toHaveLength(5)
  expect(screen.getByText('Low')).toBeInTheDocument()
  expect(screen.getByText('High')).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: 'How long?' })).toHaveAttribute('aria-valuetext', '-0.3 hours')
})
it('blocks incomplete submission, links required hints and focuses the first unanswered control', async () => {
  const context = interaction()
  render(element({ interaction: context }))
  await submit()
  expect(screen.getAllByText(en.chat.question.required)).toHaveLength(5)
  expect(within(group('When?')).getAllByRole('radio')[0]).toHaveFocus()
  expect(screen.getAllByRole('group', { name: 'When?' })[0]).toHaveAttribute('aria-invalid', 'true')
  expect(context.send).not.toHaveBeenCalled()
})
it('round trips every typed answer through the owning registry, then locks and shows the chosen values', async () => {
  const context = interaction()
  render(<NextIntlClientProvider locale="en" messages={en}><ChatBlock part={{ kind: 'question', block }} onActionChipClick={undefined} interaction={context} /></NextIntlClientProvider>)
  complete()
  expect(screen.getByText('5 of 5 questions answered')).toBeInTheDocument()
  expect(canReloadDesktopWeb()).toBe(false)
  await submit()
  expect(context.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'question', answer: { blockId: block.blockId, selectedIds: [], answers: questionAnswersFixture } }))
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  const settled = screen.getByText(/You chose When\?: Morning/)
  expect(settled.parentElement).toHaveFocus()
  expect(settled).toHaveTextContent('Add a reminder?: No')
  expect(canReloadDesktopWeb()).toBe(true)
})
it('keeps custom text while typing, replaces exclusive choices, and permits a custom multiple answer', () => {
  render(element())
  fireEvent.click(within(group('When?')).getByRole('radio', { name: /Morning/ }))
  const fields = screen.getAllByLabelText(en.chat.choice.freeText)
  fireEvent.change(fields[0]!, { target: { value: 'After work ' } })
  expect(fields[0]).toHaveValue('After work ')
  expect(within(group('When?')).getAllByRole('radio').every(row => row.getAttribute('aria-checked') === 'false')).toBe(true)
  fireEvent.change(fields[2]!, { target: { value: 'Ask me later' } })
  expect(screen.getByText('2 of 5 questions answered')).toBeInTheDocument()
  fireEvent.click(within(group('Add a reminder?')).getByRole('radio', { name: en.common.no }))
  expect(fields[2]).toHaveValue('')
})
it('selects the scale with arrow keys without submitting and permits the slider minimum', async () => {
  const context = interaction()
  render(element({ interaction: context }))
  const radios = within(group('How much energy?')).getAllByRole('radio')
  expect(radios.map(radio => radio.tabIndex)).toEqual([0, -1, -1, -1, -1])
  radios[0]!.focus()
  await pressRadioKey(radios[0]!, 'ArrowRight')
  expect(radios[1]).toHaveAttribute('aria-checked', 'true')
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
  expect(screen.getByText('-0.3 hours')).toBeInTheDocument()
  expect(screen.getByText('2 of 5 questions answered')).toBeInTheDocument()
  expect(context.send).not.toHaveBeenCalled()
})
it('guards double submission, disables all inputs while acting and retains answers for retry', async () => {
  let finish!: (value: { ok: false; status: number }) => void
  const context = interaction({ send: vi.fn<BlockAnswerInteraction['send']>(() => new Promise(resolve => { finish = resolve })) })
  render(element({ interaction: context }))
  complete()
  await submit()
  await submit()
  expect(context.send).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('textbox').every(input => input.hasAttribute('disabled'))).toBe(true)
  expect(screen.getByRole('slider')).toHaveAttribute('aria-disabled', 'true')
  await act(async () => { finish({ ok: false, status: 500 }) })
  expect(screen.getByText(en.chat.choice.error)).toBeInTheDocument()
  expect(screen.getByText('5 of 5 questions answered')).toBeInTheDocument()
})
it.each(['offline', 'limit', 'expired', 'saved'] as const)('retains the %s guard', async mode => {
  const context = interaction({ isOnline: mode !== 'offline', atMessageLimit: mode === 'limit' })
  render(element({ interaction: context, expired: mode === 'expired', savedAnswer: mode === 'saved' ? { text: 'Saved answers', answered: true } : undefined }))
  if (mode === 'expired' || mode === 'saved') expect(screen.queryByRole('button', { name: en.chat.choice.submit })).not.toBeInTheDocument()
  else expect(screen.getByRole('button', { name: en.chat.choice.submit })).toBeDisabled()
  expect(context.send).not.toHaveBeenCalled()
})
