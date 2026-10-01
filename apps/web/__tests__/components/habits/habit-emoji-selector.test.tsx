import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { HABIT_EMOJI_CATEGORIES, buildHabitUnderstandingLabels } from '@orbit/shared/utils'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'

const mockCloseSheet = vi.hoisted(() => vi.fn((afterClose?: () => void) => afterClose?.()))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, headerAccessory }: { children: React.ReactNode; headerAccessory?: React.ReactNode }) => <div role="dialog">{headerAccessory}{children}</div>,
  useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: mockCloseSheet }),
}))

const firstCategory = HABIT_EMOJI_CATEGORIES[0]!
const firstEmoji = firstCategory.emojis[0]!

function UnderstandingWithEmoji({ resolved }: Readonly<{ resolved: boolean }>) {
  const [emoji, setEmoji] = useState('')
  return (
    <HabitUnderstanding
      value="Run"
      emoji={emoji}
      days={[]}
      dayOptions={[]}
      quantity={1}
      mode="fixed"
      intervalWeeks={1}
      sentence={resolved ? 'Every day' : null}
      consumed={[]}
      onValueChange={vi.fn()}
      onEmojiSelect={setEmoji}
      onToggleDay={vi.fn()}
      onQuantityChange={vi.fn()}
      onModeChange={vi.fn()}
      onIntervalWeeksChange={vi.fn()}
      labels={buildHabitUnderstandingLabels((key) => key)}
    />
  )
}

describe('HabitEmojiSelector', () => {
  beforeEach(() => {
    mockCloseSheet.mockClear()
  })

  it.each([false, true])('selects, changes, and clears through the form, resolved %s', async (resolved) => {
    render(<UnderstandingWithEmoji resolved={resolved} />)
    const user = userEvent.setup()
    const well = screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })

    await user.tab()
    await user.tab()
    expect(well).toHaveFocus()
    expect(well).toHaveClass(
      'focus-visible:outline-2',
      'focus-visible:outline-solid',
      'focus-visible:outline-[var(--fg-1)]',
      'focus-visible:-outline-offset-2',
    )
    expect(well.className).not.toMatch(/focus-visible:(?:outline-none|shadow-)/)
    await user.keyboard('{Enter}')
    expect(well).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('option', { name: `habits.form.emoji: ${firstEmoji}` }))
    expect(well).toHaveTextContent(firstEmoji)
    expect(screen.queryByRole('dialog')).toBeNull()

    const replacement = firstCategory.emojis[1]!
    await user.click(well)
    await user.click(screen.getByRole('option', { name: `habits.form.emoji: ${replacement}` }))
    expect(well).toHaveTextContent(replacement)
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(well)
    await user.click(screen.getByRole('button', { name: 'habits.form.emojiRemove' }))
    expect(well.textContent).toBe('')
    expect(screen.queryByRole('button', { name: 'habits.form.emojiRemove' })).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('filters, clears, and toggles a category in the picker', () => {
    render(<HabitEmojiSelector selectedEmoji="" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))

    const search = screen.getByPlaceholderText('habits.form.emojiSearchPlaceholder')
    fireEvent.change(search, { target: { value: 'not-an-emoji-query' } })
    expect(screen.getByText('habits.form.emojiPickerEmpty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiClearSearch' }))
    expect(search).toHaveValue('')

    const category = screen.getByRole('button', { name: firstCategory.labelKey })
    fireEvent.click(category)
    expect(category).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(category)
    expect(category).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects an emoji after the sheet closes', () => {
    const onSelect = vi.fn()
    render(<HabitEmojiSelector selectedEmoji="" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: `habits.form.emoji: ${firstEmoji}` }))

    expect(mockCloseSheet).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(firstEmoji)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('removes the selected emoji without closing the sheet', () => {
    const onSelect = vi.fn()
    render(<HabitEmojiSelector selectedEmoji={firstEmoji} onSelect={onSelect} wellSize={76} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiRemove' }))
    expect(onSelect).toHaveBeenCalledWith('')
    expect(mockCloseSheet).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('blocks manual emoji changes while a suggestion is pending', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <HabitEmojiSelector selectedEmoji="" onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))

    rerender(
      <HabitEmojiSelector selectedEmoji="" onSelect={onSelect} isDisabled />,
    )
    const option = screen.getByRole('option', { name: `habits.form.emoji: ${firstEmoji}` })
    expect(option).toBeDisabled()
    fireEvent.click(option)

    expect(onSelect).not.toHaveBeenCalled()
    expect(mockCloseSheet).not.toHaveBeenCalled()
  })
})
