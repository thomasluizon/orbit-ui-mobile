import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'

vi.mock('@/hooks/use-push-notification-preferences', () => ({
  isPushNotificationSupported: () => true,
  subscribeToPushNotifications: vi.fn(),
}))

vi.mock('next-intl', () => ({ useLocale: () => 'en' }))

const t = ((key: string) => key) as Parameters<typeof ReminderSection>[0]['t']

describe('reminder permission notice', () => {
  it('keeps an unsaved offset reminder open while settings open in another tab', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<ReminderSection reminderEnabled reminderTimes={[15]} onReminderTimesChange={vi.fn()} onToggleReminder={vi.fn()} reminderLabel={() => '15 min'} t={t} />)
    expect(screen.getByRole('switch', { name: 'habits.form.reminder' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('habits.form.reminderPermissionNeeded')
    expect(screen.getByRole('link', { name: 'habits.form.reminderSettingsAction' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/preferences')
  })

  it('shows the same settings path for a scheduled reminder', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<ScheduledReminderSection reminderEnabled scheduledReminders={[]} onToggleReminder={vi.fn()} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} t={t} />)
    expect(screen.getByRole('switch', { name: 'habits.form.scheduledReminder' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('link', { name: 'habits.form.reminderSettingsAction' })).toHaveAttribute('target', '_blank')
  })
})
