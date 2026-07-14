import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

vi.mock('@/components/ui/app-time-picker', () => ({
  AppTimePicker: ({
    value,
    ariaLabel,
    onChange,
  }: {
    value: string
    ariaLabel?: string
    onChange: (value: string) => void
  }) => (
    <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key
const t = translate as unknown as Parameters<typeof ScheduledReminderSection>[0]['t']

type Props = Parameters<typeof ScheduledReminderSection>[0]

function renderSection(overrides?: Partial<Props>) {
  const props: Props = {
    reminderEnabled: true,
    scheduledReminders: [],
    onToggleReminder: vi.fn(),
    onSetScheduledReminders: vi.fn(),
    onValidationError: vi.fn(),
    t,
    ...overrides,
  }
  render(<ScheduledReminderSection {...props} />)
  return props
}

const sameDay = (time: string) => ({ when: 'same_day' as ScheduledReminderWhen, time })

describe('ScheduledReminderSection', () => {
  it('collapses the body when disabled', () => {
    renderSection({ reminderEnabled: false })
    expect(screen.queryByText('habits.form.scheduledReminderAdd')).toBeNull()
  })

  it('drops its own switch when nested beside the offset-reminder card', () => {
    renderSection({ nested: true })
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('renders same-day and day-before chips and removes the clicked one', () => {
    const props = renderSection({
      scheduledReminders: [sameDay('08:00'), { when: 'day_before', time: '20:00' }],
    })
    expect(screen.getByText(/scheduledReminderSameDayAt/)).toBeInTheDocument()
    expect(screen.getByText(/scheduledReminderDayBeforeAt/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByLabelText('habits.form.removeScheduledReminder')[0]!)
    expect(props.onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'day_before', time: '20:00' }])
  })

  it('shows the max message and no add button once the limit is reached', () => {
    renderSection({
      scheduledReminders: [
        sameDay('06:00'),
        sameDay('07:00'),
        sameDay('08:00'),
        sameDay('09:00'),
        sameDay('10:00'),
      ],
    })
    expect(screen.getByText('habits.form.scheduledReminderMax')).toBeInTheDocument()
    expect(screen.queryByText('habits.form.scheduledReminderAdd')).toBeNull()
  })

  it('adds a valid scheduled reminder from the form', () => {
    const props = renderSection({ scheduledReminders: [] })
    fireEvent.click(screen.getByText('habits.form.scheduledReminderAdd'))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.scheduledReminderDayBefore' }))
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTimePlaceholder'), {
      target: { value: '09:30' },
    })
    fireEvent.click(screen.getByText('common.add'))
    expect(props.onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'day_before', time: '09:30' }])
  })

  it('reports a duplicate reminder through the validation callback', () => {
    const props = renderSection({ scheduledReminders: [sameDay('08:00')] })
    fireEvent.click(screen.getByText('habits.form.scheduledReminderAdd'))
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTimePlaceholder'), {
      target: { value: '08:00' },
    })
    fireEvent.click(screen.getByText('common.add'))
    expect(props.onValidationError).toHaveBeenCalledWith('habits.form.duplicateScheduledReminder')
    expect(props.onSetScheduledReminders).not.toHaveBeenCalled()
  })

  it('reports an invalid reminder time through the validation callback', () => {
    const props = renderSection({ scheduledReminders: [] })
    fireEvent.click(screen.getByText('habits.form.scheduledReminderAdd'))
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTimePlaceholder'), {
      target: { value: '25:61' },
    })
    fireEvent.click(screen.getByText('common.add'))
    expect(props.onValidationError).toHaveBeenCalledWith('habits.form.invalidScheduledReminderTime')
  })

  it('cancels the form and clears the drafted time', () => {
    renderSection({ scheduledReminders: [] })
    fireEvent.click(screen.getByText('habits.form.scheduledReminderAdd'))
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTimePlaceholder'), {
      target: { value: '09:30' },
    })
    fireEvent.click(screen.getByLabelText('common.cancel'))
    expect(screen.queryByText('common.add')).toBeNull()
    expect(screen.getByText('habits.form.scheduledReminderAdd')).toBeInTheDocument()
  })

  it('toggles scheduled reminders through the switch', () => {
    const props = renderSection({ reminderEnabled: false })
    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.scheduledReminder' }))
    expect(props.onToggleReminder).toHaveBeenCalledTimes(1)
  })
})
