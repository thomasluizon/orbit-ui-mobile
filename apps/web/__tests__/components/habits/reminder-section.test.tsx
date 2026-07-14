import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'

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

const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key
const t = translate as unknown as Parameters<typeof ReminderSection>[0]['t']

type Props = Parameters<typeof ReminderSection>[0]

function renderSection(overrides?: Partial<Props>) {
  const props: Props = {
    reminderEnabled: true,
    reminderTimes: [15, 30],
    onReminderTimesChange: vi.fn(),
    onToggleReminder: vi.fn(),
    reminderLabel: (minutes: number) => `label-${minutes}`,
    t,
    ...overrides,
  }
  render(<ReminderSection {...props} />)
  return props
}

describe('ReminderSection', () => {
  it('collapses the body when reminders are disabled', () => {
    renderSection({ reminderEnabled: false })
    expect(screen.queryByText('habits.form.reminderAdd')).toBeNull()
    expect(screen.queryByText('label-15')).toBeNull()
    expect(screen.getByRole('switch', { name: 'habits.form.reminder' })).toBeInTheDocument()
  })

  it('renders a chip per reminder time using the label formatter', () => {
    renderSection({ reminderTimes: [15, 30] })
    expect(screen.getByText('label-15')).toBeInTheDocument()
    expect(screen.getByText('label-30')).toBeInTheDocument()
  })

  it('removes the clicked reminder and keeps the rest', () => {
    const props = renderSection({ reminderTimes: [15, 30] })
    fireEvent.click(screen.getAllByLabelText('habits.form.removeReminder')[0]!)
    expect(props.onReminderTimesChange).toHaveBeenCalledWith([30])
  })

  it('disables removal when only one reminder remains', () => {
    renderSection({ reminderTimes: [15] })
    expect(screen.getByLabelText('habits.form.removeReminder')).toBeDisabled()
  })

  it('toggles reminders through the switch', () => {
    const props = renderSection({ reminderEnabled: false })
    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.reminder' }))
    expect(props.onToggleReminder).toHaveBeenCalledTimes(1)
  })

  it('adds a preset reminder sorted descending and hides already-selected presets', () => {
    const props = renderSection({ reminderTimes: [10] })
    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    expect(screen.queryByText('habits.form.reminder10min')).toBeNull()
    fireEvent.click(screen.getByText('habits.form.reminder1hour'))
    expect(props.onReminderTimesChange).toHaveBeenCalledWith([60, 10])
  })

  it('adds a custom reminder in minutes', () => {
    const props = renderSection({ reminderTimes: [] })
    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    fireEvent.click(screen.getByText('habits.form.reminderCustom'))
    fireEvent.change(screen.getByPlaceholderText('habits.form.reminderCustomPlaceholder'), {
      target: { value: '45' },
    })
    fireEvent.click(screen.getByLabelText('common.add'))
    expect(props.onReminderTimesChange).toHaveBeenCalledWith([45])
  })

  it('multiplies custom hours and days into minutes', () => {
    const props = renderSection({ reminderTimes: [] })
    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    fireEvent.click(screen.getByText('habits.form.reminderCustom'))
    fireEvent.change(screen.getByLabelText('habits.form.reminderCustom'), {
      target: { value: 'days' },
    })
    fireEvent.change(screen.getByPlaceholderText('habits.form.reminderCustomPlaceholder'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByLabelText('common.add'))
    expect(props.onReminderTimesChange).toHaveBeenCalledWith([2880])
  })

  it('ignores a non-positive custom value', () => {
    const props = renderSection({ reminderTimes: [] })
    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    fireEvent.click(screen.getByText('habits.form.reminderCustom'))
    fireEvent.change(screen.getByPlaceholderText('habits.form.reminderCustomPlaceholder'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByLabelText('common.add'))
    expect(props.onReminderTimesChange).not.toHaveBeenCalled()
  })

  it('submits a custom reminder on Enter', () => {
    const props = renderSection({ reminderTimes: [] })
    fireEvent.click(screen.getByText('habits.form.reminderAdd'))
    fireEvent.click(screen.getByText('habits.form.reminderCustom'))
    const input = screen.getByPlaceholderText('habits.form.reminderCustomPlaceholder')
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onReminderTimesChange).toHaveBeenCalledWith([3])
  })
})
