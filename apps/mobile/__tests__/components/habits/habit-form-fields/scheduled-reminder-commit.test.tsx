import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'
import { createTokensV2 } from '@/lib/theme'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true } }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ showNotice: false }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Reminder = { when: ScheduledReminderWhen; time: string }
let tree: ReturnType<typeof renderer.create>
afterEach(async () => { await renderer.act(() => tree.unmount()) })

function Editor({ save }: Readonly<{ save: (reminders: Reminder[]) => void }>) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  return <ScheduledReminderSection tokens={createTokensV2()} reminderEnabled scheduledReminders={reminders} onValidationError={vi.fn()} onSetScheduledReminders={(next) => { save(next); setReminders(next) }} />
}

describe('native scheduled reminder commit', () => {
  it.each(['onBlur', 'onSubmitEditing'])('saves only the corrected typed time on %s and resets the entry', async (finish) => {
    const save = vi.fn()
    await renderer.act(() => { tree = renderer.create(<Editor save={save} />) })
    const input = () => tree.root.findAllByType('TextInput')[0]!.props as { onFocus: () => void; onChangeText: (value: string) => void; onBlur: () => void; onSubmitEditing: () => void; value: string }
    await renderer.act(() => input().onFocus())
    for (const value of ['0', '09', '09:', '09:0', '09:00', '09:30']) await renderer.act(() => input().onChangeText(value))
    expect(save).not.toHaveBeenCalled()
    await renderer.act(() => input()[finish as 'onBlur' | 'onSubmitEditing']())
    expect(save).toHaveBeenCalledExactlyOnceWith([{ when: 'same_day', time: '09:30' }])
    expect(input().value).toBe('')
    await renderer.act(() => input().onBlur())
    expect(save).toHaveBeenCalledTimes(1)
  })
})
