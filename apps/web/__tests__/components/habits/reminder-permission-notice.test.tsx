import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }),
}))


vi.mock('@/hooks/use-push-notification-preferences', () => ({
  isPushNotificationSupported: () => true,
  subscribeToPushNotifications: vi.fn(),
}))

vi.mock('next-intl', () => ({ useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))

const t = ((key: string) => key) as Parameters<typeof ReminderSection>[0]['t']

describe('reminder permission notice', () => {
  it('keeps an unsaved offset reminder open while settings open in another tab', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<ReminderSection reminderEnabled reminderTimes={[15]} onReminderTimesChange={vi.fn()} onToggleReminder={vi.fn()} reminderLabel={() => '15 min'} t={t} />)
    expect(screen.getByRole('switch', { name: 'habits.form.reminder' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('habits.form.reminderPermissionNeeded')
    expect(screen.getByRole('link', { name: 'habits.form.reminderPermissionNeeded' })).toHaveAttribute('target', '_blank')
    const notice = screen.getByRole('status')
    const control = within(notice).getByRole('link')
    expect(control).toHaveAttribute('href', '/profile/notifications')
    expect(control).toHaveAccessibleDescription('habits.form.reminderSettingsDescription')
    expect(notice.textContent).toBe(control.textContent)
    expect(notice.querySelectorAll('a, button')).toHaveLength(1)
    expect(control.closest('p')).toBeNull()
  })

  it('shows the same settings path for a scheduled reminder', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<ScheduledReminderSection reminderEnabled scheduledReminders={[]} onToggleReminder={vi.fn()} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} t={t} />)
    expect(screen.getByRole('switch', { name: 'habits.form.scheduledReminder' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('link', { name: 'habits.form.reminderPermissionNeeded' })).toHaveAttribute('target', '_blank')
    const notice = screen.getByRole('status')
    const control = within(notice).getByRole('link')
    expect(control).toHaveAttribute('href', '/profile/notifications')
    expect(control).toHaveAccessibleDescription('habits.form.reminderSettingsDescription')
    expect(notice.textContent).toBe(control.textContent)
    expect(notice.querySelectorAll('a, button')).toHaveLength(1)
    expect(control.closest('p')).toBeNull()
  })
  it('retains one polite live region as permission changes without a second announcement node', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    const props = { reminderTimes: [15], onReminderTimesChange: vi.fn(), onToggleReminder: vi.fn(), reminderLabel: () => '15 min', t }
    const { rerender } = render(<ReminderSection {...props} reminderEnabled={false} />)
    const notice = screen.getByRole('status')
    expect(notice).toBeEmptyDOMElement()
    rerender(<ReminderSection {...props} reminderEnabled />)
    expect(screen.getByRole('status')).toBe(notice)
    expect(notice).toHaveAttribute('aria-live', 'polite')
    expect(notice).toHaveAttribute('aria-atomic', 'true')
    expect(within(notice).getAllByRole('link')).toHaveLength(1)
    rerender(<ReminderSection {...props} reminderEnabled={false} />)
    expect(screen.getByRole('status')).toBe(notice)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
