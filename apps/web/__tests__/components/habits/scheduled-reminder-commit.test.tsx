import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true } }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ showNotice: false }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

type Reminder = { when: ScheduledReminderWhen; time: string }
const t = ((key: string, values?: Record<string, string>) => values ? `${key}:${values.time}` : key) as Parameters<typeof ScheduledReminderSection>[0]['t']

function Editor({ save }: Readonly<{ save: (reminders: Reminder[]) => void }>) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  return <ScheduledReminderSection reminderEnabled scheduledReminders={reminders} onValidationError={vi.fn()} onSetScheduledReminders={(next) => { save(next); setReminders(next) }} t={t} />
}

describe('scheduled reminder commit', () => {
  it.each(['blur', 'Enter'])('saves only the corrected typed time on %s and resets the entry', (finish) => {
    const save = vi.fn()
    render(<Editor save={save} />)
    const input = screen.getByRole('textbox', { name: 'habits.form.scheduledReminderTime' })
    input.focus()
    for (const value of ['0', '09', '09:', '09:0', '09:00', '09:30']) fireEvent.change(input, { target: { value } })
    expect(save).not.toHaveBeenCalled()
    if (finish === 'blur') fireEvent.blur(input)
    else fireEvent.keyDown(input, { key: 'Enter' })
    expect(save).toHaveBeenCalledExactlyOnceWith([{ when: 'same_day', time: '09:30' }])
    expect(input).toHaveValue('')
    fireEvent.blur(input)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('saves a picker time only after Done', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const save = vi.fn()
    render(<Editor save={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.scheduledReminderTime: common.selectTime' }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'common.hours' })).getByRole('radio', { name: '09' }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'common.minutes' })).getByRole('radio', { name: '30' }))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))
    expect(save).toHaveBeenCalledExactlyOnceWith([{ when: 'same_day', time: '09:30' }])
    expect(screen.getByRole('textbox', { name: 'habits.form.scheduledReminderTime' })).toHaveValue('')
    vi.unstubAllGlobals()
  })
})
