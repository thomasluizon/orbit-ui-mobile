import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { questionBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { questionBlockSchema } from '@orbit/shared/types/question-block'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { QuestionBlock } from '@/components/chat/question-block'

afterEach(cleanup)
const scale = questionBlockFixture.questions.find(question => question.type === 'scale')!
const block = questionBlockSchema.parse({ ...questionBlockFixture, questions: [scale] })
const mount = () => render(<NextIntlClientProvider locale="en" messages={en}>
  <QuestionBlock block={block} interaction={{ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: async () => ({ ok: true as const }) }} />
</NextIntlClientProvider>)

it('lays the five scale targets in one touch-sized row of touching cells', () => {
  mount()
  const group = screen.getByRole('radiogroup', { name: scale.prompt })
  expect(group).toHaveClass('grid-cols-5')
  expect(group.style.gap).toBe('0px')
  const radios = within(group).getAllByRole('radio')
  expect(radios).toHaveLength(5)
  for (const radio of radios) expect(radio).toHaveClass('min-h-[var(--touch-min)]', 'min-w-[var(--touch-min)]')
})

it('insets the paint of every scale target inside its transparent target by half the interaction clearance', () => {
  mount()
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.style.padding).toBe(`${INTERACTION_FILL_CLEARANCE / 2}px`)
    expect(radio).toHaveClass('bg-transparent', 'focus-visible:outline-none')
    const fill = radio.querySelector('[data-slot="question-scale-fill"]')
    expect(fill, 'each scale target owns one inset fill').not.toBeNull()
    expect(fill).toHaveClass('group-hover/scale-option:bg-[var(--bg-hover)]', 'group-active/scale-option:bg-[var(--bg-hover)]', 'group-focus-visible/scale-option:outline-2', 'group-aria-checked/scale-option:bg-[var(--bg-well)]')
  }
})

it('marks only the chosen target fill as selected and checks only that radio', () => {
  mount()
  fireEvent.click(screen.getByRole('radio', { name: '3' }))
  const fills = [...document.querySelectorAll('[data-slot="question-scale-fill"]')]
  expect(fills.map(fill => fill.hasAttribute('data-selected'))).toEqual([false, false, true, false, false])
  expect(screen.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true')
})
