import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HABIT_EMOJI_CATEGORIES } from '@orbit/shared/utils'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'

const mockCloseSheet = vi.hoisted(() => vi.fn((afterClose?: () => void) => afterClose?.()))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: mockCloseSheet }),
}))

const firstCategory = HABIT_EMOJI_CATEGORIES[0]!
const firstEmoji = firstCategory.emojis[0]!

describe('HabitEmojiSelector', () => {
  beforeEach(() => {
    mockCloseSheet.mockClear()
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

  it('removes the selected emoji through the same close flow', () => {
    const onSelect = vi.fn()
    render(<HabitEmojiSelector selectedEmoji={firstEmoji} onSelect={onSelect} wellSize={76} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiRemove' }))
    expect(onSelect).toHaveBeenCalledWith('')
  })
})
