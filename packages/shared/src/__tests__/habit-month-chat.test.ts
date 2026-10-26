import { describe, expect, it } from 'vitest'
import { buildHabitMonthCalendar } from '../chat/habit-month'
import { buildCalendarMonthModel, formatAPIDate } from '../utils'
import { buildChatClientContext } from '../chat/client-context'
import { habitMonthCardSchema, habitMonthReadBlockResponseSchema, readBlockResponseSchema, chatResponseSchema, chatMessageSchema } from '../types/chat'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { habitMonthFixture } from '../test-support/habit-month-fixture'

describe('habit month chat contract', () => {
  it('preserves the negotiated calendar through final delivery and history', () => {
    const part = { type: 'block', kind: 'habitMonth', block: habitMonthFixture }
    const response = chatResponseSchema.parse({ actions: [], parts: [part] })
    const message = chatMessageSchema.parse({
      id: 'month', role: 'ai', timestamp: new Date(), ...buildChatFinalMessageFields(response, []),
    })
    expect(message.parts).toEqual([part])
  })

  it('retains text from an API without habit-month blocks', () => {
    const content = 'Habit calendar: 2026-09-01 / 2026-09-30'
    const response = chatResponseSchema.parse({ actions: [], aiMessage: content })
    expect(buildChatFinalMessageFields(response, []).parts).toEqual([{ type: 'text', text: content }])
  })
})


it('uses server-local today and the calendar projection for scheduled days and skips', () => {
  const card = habitMonthCardSchema.parse(habitMonthFixture)
  const { dayMap, months } = buildHabitMonthCalendar(card)
  const { gridDays } = buildCalendarMonthModel(months[0]!, dayMap, card.weekStartDay, card.today)
  expect(gridDays.find(day => day.dateStr === '2026-09-01')).toMatchObject({ completedCount: 1, totalCount: 1 })
  for (const date of ['2026-09-02', '2026-09-03']) {
    expect(gridDays.find(day => day.dateStr === date)).toMatchObject({ completedCount: 0, totalCount: 1 })
  }
  expect(dayMap.get('2026-09-11')![0]!.status).toBe('upcoming')
  expect(dayMap.get('2026-09-12')![0]!.status).toBe('upcoming')
})

it('preserves multi-month ranges and leaves dates outside the query unavailable', () => {
  const card = habitMonthCardSchema.parse({ ...habitMonthFixture, dateFrom: '2026-08-30', dateTo: '2026-10-01' })
  const { dayMap, months, range } = buildHabitMonthCalendar(card)
  expect(months.map(formatAPIDate)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  const first = buildCalendarMonthModel(months[0]!, dayMap, card.weekStartDay, card.today, range)
  expect(first.gridDays.find(day => day.dateStr === '2026-08-29')!.isCurrentMonth).toBe(false)
  expect(first.gridDays.find(day => day.dateStr === '2026-08-30')!.isCurrentMonth).toBe(true)
})

it.each(['web', 'mobile'] as const)('negotiates the new kind on %s without expanding the shared refresh union', platform => {
  expect(buildChatClientContext({ platform, locale: 'en' }).partKinds).toContain('habitMonth')
  const response = { kind: 'habitMonth', block: habitMonthFixture, read: habitMonthFixture.read }
  expect(habitMonthReadBlockResponseSchema.safeParse(response).success).toBe(true)
  expect(readBlockResponseSchema.safeParse(response).success).toBe(false)
})
