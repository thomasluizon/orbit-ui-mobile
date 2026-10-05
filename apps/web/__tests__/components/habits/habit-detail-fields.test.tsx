import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetailScopedChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailSchedule } from '@/components/habits/habit-detail-fields'

const preferences = vi.hoisted(() => ({ weekStartDay: 1 }))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: preferences.weekStartDay } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))

beforeEach(() => { preferences.weekStartDay = 1 })

describe.each(['en', 'pt-BR'])('HabitDetailSchedule weekday preference in %s', (locale) => {
  it.each([0, 1].flatMap((weekStartDay) => [false, true].flatMap((open) => [[], ['Monday']].map((days) => ({ weekStartDay, open, days })))))('orders and saves weekdays with week start $weekStartDay, editor $open and selected $days', ({ weekStartDay, open, days }) => {
    preferences.weekStartDay = weekStartDay
    const messages = locale === 'en' ? en : ptBR
    const onSave = vi.fn()
    render(<NextIntlClientProvider locale={locale} messages={messages}>
      <HabitDetailSchedule habit={{ ...makeHabitDetailScopedChild('2026-09-29'), frequencyQuantity: 1, days }} summary="Every day" open={open} onSave={onSave} onToggle={vi.fn()} onCancel={vi.fn()} />
    </NextIntlClientProvider>)
    const orderedDays: (keyof typeof messages.dates.daysLong)[] = weekStartDay === 1
      ? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const labels = orderedDays.map((day) => messages.dates.daysLong[day])
    const chips = screen.getAllByRole('button').filter((button) => labels.includes(button.getAttribute('aria-label') ?? ''))
    expect(chips.map((button) => button.getAttribute('aria-label'))).toEqual(labels)
    expect(chips.map((button) => button.textContent)).toEqual(orderedDays.map((day) => messages.dates.daysShort[day].charAt(0)))
    expect(chips.map((button) => button.getAttribute('aria-pressed'))).toEqual(orderedDays.map((day) => String(days.length === 0 || day === 'monday')))
    fireEvent.click(screen.getByRole('button', { name: messages.dates.daysLong.monday }))
    if (open) fireEvent.click(screen.getByRole('button', { name: messages.common.save }))
    expect(onSave).toHaveBeenCalledWith({ frequencyUnit: 'Day', frequencyQuantity: 1, days: days.length === 0 ? ['Sunday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : [] })
  })
})
