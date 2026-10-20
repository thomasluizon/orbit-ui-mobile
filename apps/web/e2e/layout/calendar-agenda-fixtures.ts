import type { BrowserContext } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutProfileSession } from './profile-session'

const agendaDate = LAYOUT_FIXED_TIME.slice(0, 10)
export const agendaTitles = ['Ler 10 minutos', 'Beber água', 'Evitar distrações', 'Preparar tudo para uma caminhada tranquila com cada coisa no seu lugar']
export const agendaRowTitles = [agendaTitles[2]!, agendaTitles[3]!, agendaTitles[1]!, agendaTitles[0]!]
export const agendaCalendarMonth = calendarMonthResponseSchema.parse({
  habits: agendaTitles.map((title, index) => makeHabitScheduleItem({
    id: `agenda-${index}`, title, children: [], hasSubHabits: false,
    dueDate: agendaDate, scheduledDates: [agendaDate],
    dueTime: index === 0 ? '21:00' : index === 1 ? '08:00' : null, isBadHabit: index === 2,
  })),
  logs: { 'agenda-2': [{ id: 'avoid-log', date: agendaDate, value: 1, createdAtUtc: `${agendaDate}T10:00:00Z` }] },
})

export async function prepareAgendaCalendar(context: BrowserContext, locale: 'en' | 'pt-BR') {
  const profile = profileSchema.parse({ ...profileFixture, language: locale, weekStartDay: 1, uses24HourClock: true, timeZone: 'America/Sao_Paulo' })
  await setLayoutProfileSession(context, profile)
  await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
    (route) => route.fulfill({ json: agendaCalendarMonth }))
}
