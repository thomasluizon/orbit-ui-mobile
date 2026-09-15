import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubHabitEditor } from '@/components/habits/create-habit-modal/sub-habit-editor'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}))

vi.mock('@/components/ui/app-select', () => ({
  AppSelect: ({
    value,
    options,
    onChange,
    label,
  }: {
    value: string
    options: ReadonlyArray<{ value: string; label: string }>
    onChange: (value: string) => void
    label?: string
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${JSON.stringify(values)})` : key

describe('habit form focus treatments', () => {
  it('shows the design-system focus shadow on the custom reminder input', () => {
    render(
      <ReminderSection
        reminderEnabled
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
        onToggleReminder={vi.fn()}
        reminderLabel={String}
        t={translate as Parameters<typeof ReminderSection>[0]['t']}
      />,
    )

    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    fireEvent.click(screen.getByText('habits.form.reminderCustom'))

    const input = screen.getByLabelText('habits.form.reminderCustomPlaceholder')
    expect(input).toHaveClass('focus-visible:outline-none')
    expect(input).toHaveClass('focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]')
  })

  it('shows the design-system focus shadow on the tag editor input', () => {
    render(
      <TagEditorRow
        value=""
        inputAriaLabel="Tag name"
        actionLabel="Save"
        cancelAriaLabel="Cancel"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Tag name' })
    expect(input).toHaveClass('focus-visible:outline-none')
    expect(input).toHaveClass('focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]')
  })

  it('restores native focus and keeps the row focus treatment for sub-habit inputs', () => {
    render(
      <SubHabitEditor
        subHabits={[{ id: 'sub-1', value: 'Warm up' }]}
        onUpdateSubHabit={vi.fn()}
        onRemoveSubHabit={vi.fn()}
        onAddSubHabit={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox')
    expect(input).not.toHaveClass('focus:outline-none')
    expect(input.parentElement).toHaveClass('focus-within:shadow-[inset_0_0_0_2px_var(--primary)]')
  })
})
