import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarDayDetail } from '@/app/(tabs)/calendar/_components/calendar-day-detail'
import { createTokensV2 } from '@/lib/theme'
import { i18n } from '@/lib/i18n'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import type { CalendarSyncEvent } from '@orbit/shared'

vi.unmock('react-i18next')
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
const TestRenderer = require('react-test-renderer')
afterEach(async () => { await i18n.changeLanguage('en') })

const events: CalendarSyncEvent[] = Array.from({ length: 21 }, (_, index) => ({
  id: `event-${index}`, title: index === 0 ? '1:1 FutureProofing Engineering' : `Evento ${index}`,
  description: null, startDate: '2026-09-12', startTime: '09:00', endTime: null,
  isRecurring: false, recurrenceRule: null, reminders: [], calendarName: 'Trabalho',
}))

describe('Android day card geometry', () => {
  it.each([320, 360].flatMap((width) => [false, true].map((loggable) => ({ width, loggable }))))('fits pt-BR titles at $width with loggable=$loggable using Android styles and fonts', async ({ width, loggable }) => {
    await i18n.changeLanguage('pt-BR')
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarDayDetail selectedDate="2026-09-12" title="Hoje, 12 de setembro"
      filteredEntries={[{ habitId: 'habit-1', title: 'Caminhar no parque', status: 'completed', isBadHabit: false, dueTime: '08:00', isOneTime: false }]}
      calendarEvents={events} showEventSource calendarEventsState="ready" loggable={loggable} pendingEntryStates={new Map()} completedCount={1}
      onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} onGoToDay={vi.fn()}
      displayTime={(time) => time} t={i18n.t} tokens={createTokensV2('purple', 'dark')} />) })
    try {
      for (const scale of [1, 2]) {
        const measured = measureProfileRow(tree.toJSON(), width - 32, scale)
        const event = measured.texts.find((text) => text.label === events[0]!.title)!
        expect(event.lines).toBeLessThanOrEqual(2)
        if (scale === 1) {
          expect(event.clipped).toBe(false)
          expect(measured.texts.find((text) => text.label === 'Caminhar no parque')!.lines).toBe(1)
          expect(measured.texts.find((text) => text.label === i18n.t('calendar.dayDetail.viewAllEvents', { count: 21 }))!.lines).toBe(1)
        }
        for (const text of measured.texts) {
          expect(text.left, JSON.stringify(text)).toBeGreaterThanOrEqual(0)
          expect(text.right, JSON.stringify(text)).toBeLessThanOrEqual(width - 32)
        }
      }
    } finally { TestRenderer.act(() => tree.unmount()) }
  })
})
