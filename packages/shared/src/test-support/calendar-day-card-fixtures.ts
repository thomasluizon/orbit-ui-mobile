import { calendarMonthResponseSchema } from '../types/habit'
import { buildCalendarDayMap } from '../utils/habits'
import { makeHabitScheduleItem } from './habit-detail-fixtures'

export const calendarDayCardDate = '2026-09-04'

export function makeCalendarDayCardMonth() {
  const child = makeHabitScheduleItem().children[0]!
  return calendarMonthResponseSchema.parse({
    habits: [
      ...['Caminhar', 'Ler', 'Caminhar pelo bairro depois do trabalho e conversar com os amigos sobre os planos para a semana'].map((title, index) => makeHabitScheduleItem({
        id: `parent-${index}`, title, dueDate: calendarDayCardDate,
        dueTime: index === 0 ? '08:00' : null,
        scheduledDates: [calendarDayCardDate], children: [], hasSubHabits: false,
      })),
      makeHabitScheduleItem({
        id: 'family', scheduledDates: [],
        children: ['Alongar', 'Respirar'].map((title, index) => ({
          ...child, id: `child-${index}`, title, dueTime: index === 0 ? '08:00' : null,
          instances: [{ date: calendarDayCardDate, status: 'Completed', logId: `child-log-${index}` }],
        })),
      }),
    ],
    logs: {},
  })
}

export function makeCalendarDayCardEntries() {
  return buildCalendarDayMap(makeCalendarDayCardMonth(), { from: calendarDayCardDate, to: calendarDayCardDate }).get(calendarDayCardDate)!
}
