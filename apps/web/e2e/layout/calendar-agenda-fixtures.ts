import type { BrowserContext, Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

export const agendaTitles = ['Ler 10 minutos', 'Beber água', 'Evitar distrações', 'Preparar tudo para uma caminhada tranquila com cada coisa no seu lugar']
export const agendaRowTitles = [agendaTitles[2]!, agendaTitles[3]!, agendaTitles[1]!, agendaTitles[0]!]
export const agendaCalendarMonth = calendarMonthResponseSchema.parse({
  habits: agendaTitles.map((title, index) => makeHabitScheduleItem({
    id: `agenda-${index}`, title, children: [], hasSubHabits: false,
    dueDate: '2026-10-05', scheduledDates: ['2026-10-05'],
    dueTime: index === 0 ? '21:00' : index === 1 ? '08:00' : null, isBadHabit: index === 2,
  })),
  logs: { 'agenda-2': [{ id: 'avoid-log', date: '2026-10-05', value: 1, createdAtUtc: '2026-10-05T10:00:00Z' }] },
})

export async function prepareAgendaCalendar(page: Page, context: BrowserContext, locale: 'en' | 'pt-BR') {
  const profile = profileSchema.parse({ ...profileFixture, language: locale, weekStartDay: 1, uses24HourClock: true, timeZone: 'America/Sao_Paulo' })
  await setLayoutProfileSession(context, profile)
  await page.clock.setFixedTime(new Date('2026-10-05T15:00:00Z'))
  await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
    (route) => route.fulfill({ json: agendaCalendarMonth }))
}
