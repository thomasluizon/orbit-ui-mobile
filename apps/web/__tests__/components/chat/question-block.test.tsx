import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { questionBlockFixture as block, questionAnswersFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction, QuestionBlockProps } from '@orbit/shared/chat'
import { questionBlockSchema } from '@orbit/shared/types/question-block'
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
it('steps an offset decimal slider in both directions and supports Home and End', () => {
  const supplied = questionBlockSchema.parse({ ...block, questions: [{ ...block.questions[3], min: 0.05, max: 0.25, step: 0.1 }] })
  render(element({ block: supplied }))
  const slider = screen.getByRole('slider')
  const expectValue = (value: string) => {
    expect(slider).toHaveAttribute('aria-valuenow', value)
    expect(slider).toHaveAttribute('aria-valuetext', `${value} hours`)
    expect(slider).toHaveAttribute('aria-valuemin', '0.05')
    expect(slider).toHaveAttribute('aria-valuemax', '0.25')
  }
  expectValue('0.05')
  for (const [key, value] of [['ArrowRight', '0.15'], ['ArrowRight', '0.25'], ['ArrowRight', '0.25'], ['ArrowLeft', '0.15'], ['ArrowLeft', '0.05'], ['ArrowLeft', '0.05'], ['End', '0.25'], ['Home', '0.05']]) {
    fireEvent.keyDown(slider, { key })
    expectValue(value!)
    expect(screen.getByText(`${value} hours`)).toBeInTheDocument()
  }
})
it('formats slider limits, selection, announcements and the submitted summary in pt-BR', async () => {
  const context = interaction()
  const supplied = questionBlockSchema.parse({ ...block, questions: [{ ...block.questions[3], min: 0.05, max: 0.25, step: 0.1 }] })
  render(element({ block: supplied, interaction: context }, 'pt-BR'))
  expect(screen.getByText('0,05 hours / 0,25 hours')).toBeInTheDocument()
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '0,05 hours')
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  expect(screen.getByText('0,15 hours')).toBeInTheDocument()
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0.15')
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '0,15 hours')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: pt.chat.choice.submit })) })
  expect(context.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ labels: ['How long?: 0,15 hours'], answer: { blockId: block.blockId, selectedIds: [], answers: [{ questionId: 'duration', number: 0.15 }] } }))
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.getByText(/How long\?: 0,15 hours/)).toBeInTheDocument()
})
it.each(['offline', 'limit', 'expired', 'saved'] as const)('retains the %s guard', async mode => {
  const context = interaction({ isOnline: mode !== 'offline', atMessageLimit: mode === 'limit' })
  render(element({ interaction: context, expired: mode === 'expired', savedAnswer: mode === 'saved' ? { text: 'Saved answers', answered: true } : undefined }))
  if (mode === 'expired' || mode === 'saved') expect(screen.queryByRole('button', { name: en.chat.choice.submit })).not.toBeInTheDocument()
  else expect(screen.getByRole('button', { name: en.chat.choice.submit })).toBeDisabled()
  expect(context.send).not.toHaveBeenCalled()
})
