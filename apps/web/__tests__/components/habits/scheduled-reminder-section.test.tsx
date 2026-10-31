import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import { ScheduledReminderSection as ClockEditor } from '@/components/habits/habit-form-fields/scheduled-reminder-section'
import { buildCreateHabitRequest, buildEmptyHabitFormValues } from '@orbit/shared/utils'
import { RepeatReminderSection } from '@/components/habits/habit-form-fields/repeat-reminder-section'
import { pressRadioKey } from '@/__tests__/support/radio-key'

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }),
}))

const clockState = vi.hoisted(() => ({ language: 'pt-BR', uses24HourClock: false }))
vi.mock('next-intl', () => ({ useLocale: () => clockState.language, useTranslations: () => (key: string) => key }))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: clockState.uses24HourClock } }) }))

vi.mock('@/components/ui/time-field', () => ({
  TimeField: ({
    value,
    label,
    onChange,
  }: {
    value: string
    label: string
    onChange: (value: string) => void
  }) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

function ScheduledReminderSection({ onToggleReminder, nested, ...props }: Parameters<typeof ClockEditor>[0] & { onToggleReminder: () => void; nested?: boolean }) {
  const editor = <ClockEditor {...props} />
  return nested ? editor : <RepeatReminderSection value={null} general={false} enabled={props.reminderEnabled} onToggle={onToggleReminder} onChange={vi.fn()}>{editor}</RepeatReminderSection>
}

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
    expect(screen.queryByRole('button', { name: 'habits.form.scheduledReminderAdd' })).toBeNull()
  })

  it('drops its own switch when nested beside the offset-reminder card', () => {
    renderSection({ nested: true })
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it.each([
    ['pt-BR', false, '7:30 PM', '19:30'],
    ['en', true, '19:30', '7:30 PM'],
  ])('shows fixed reminder times with %s and the saved clock', (language, uses24HourClock, expected, excluded) => {
    clockState.language = language
    clockState.uses24HourClock = uses24HourClock
    renderSection({ scheduledReminders: [sameDay('19:30')] })
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(excluded))).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'habits.form.scheduledReminderAdd' })).toBeNull()
  })

  it('adds a valid scheduled reminder from the form', async () => {
    const props = renderSection({ scheduledReminders: [] })
    const group = screen.getByRole('radiogroup', { name: 'habits.form.scheduledReminder' })
    const dayBefore = screen.getByRole('radio', { name: 'habits.form.scheduledReminderDayBefore' })
    const sameDayOption = screen.getByRole('radio', { name: 'habits.form.scheduledReminderSameDay' })
    expect(group).toContainElement(dayBefore)
    expect([dayBefore.tabIndex, sameDayOption.tabIndex]).toEqual([-1, 0])
    sameDayOption.focus()
    await pressRadioKey(sameDayOption, 'ArrowRight')
    expect(dayBefore).toHaveFocus()
    expect(dayBefore).toHaveAttribute('aria-checked', 'true')
    expect([dayBefore.tabIndex, sameDayOption.tabIndex]).toEqual([0, -1])
    await pressRadioKey(dayBefore, 'ArrowRight')
    expect(sameDayOption).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(dayBefore)
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTime'), {
      target: { value: '09:30' },
    })
    expect(props.onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'day_before', time: '09:30' }])
    const form = {
      ...buildEmptyHabitFormValues('2025-03-10'),
      dueTime: '10:00',
      reminderEnabled: true,
      scheduledReminders: [{ when: 'day_before' as const, time: '09:30' }],
    }
    expect(buildCreateHabitRequest(form, [], [], [], []).relativeReminders).toEqual([
      { when: 'day_before', time: '09:30' },
    ])
  })

  it('reports a duplicate reminder through the validation callback', () => {
    const props = renderSection({ scheduledReminders: [sameDay('08:00')] })
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTime'), {
      target: { value: '08:00' },
    })
    expect(props.onValidationError).toHaveBeenCalledWith('habits.form.duplicateScheduledReminder')
    expect(props.onSetScheduledReminders).not.toHaveBeenCalled()
  })

  it('reports an invalid reminder time through the validation callback', () => {
    const props = renderSection({ scheduledReminders: [] })
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTime'), {
      target: { value: '25:61' },
    })
    expect(props.onValidationError).toHaveBeenCalledWith('habits.form.invalidScheduledReminderTime')
  })

  it('adds when a time is picked with a visible label and no orphan actions', () => {
    const props = renderSection()
    expect(screen.getByLabelText('habits.form.scheduledReminderTime')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.add' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'common.cancel' })).toBeNull()
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTime'), { target: { value: '09:30' } })
    expect(props.onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'same_day', time: '09:30' }])
  })

  it('hides day-before when the item is due today and keeps existing reminders removable', () => {
    const props = renderSection({ hideDayBefore: true, scheduledReminders: [{ when: 'day_before', time: '20:00' }] })
    expect(screen.queryByRole('radio', { name: 'habits.form.scheduledReminderDayBefore' })).toBeNull()
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTime'), { target: { value: '09:30' } })
    expect(props.onSetScheduledReminders).toHaveBeenCalledWith([{ when: 'day_before', time: '20:00' }, { when: 'same_day', time: '09:30' }])
    fireEvent.click(screen.getByLabelText('habits.form.removeScheduledReminder'))
    expect(props.onSetScheduledReminders).toHaveBeenLastCalledWith([])
  })

  it('toggles scheduled reminders through the switch', () => {
    const props = renderSection({ reminderEnabled: false })
    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.reminder' }))
    expect(props.onToggleReminder).toHaveBeenCalledTimes(1)
  })
})
