import React from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarMonthDay } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { CalendarGrid } from '@/app/(tabs)/calendar/_components/calendar-grid'

const TestRenderer = require('react-test-renderer')

function gridDay(dateStr: string, completedCount = 0, totalCount = 1): CalendarMonthDay {
  const date = new Date(`${dateStr}T12:00:00`)
  return {
    date,
    dateStr,
    day: date.getDate(),
    isCurrentMonth: true,
    isToday: dateStr === '2026-09-11',
    entries: [],
    completedCount,
    totalCount,
    completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
  }
}

describe('CalendarGrid (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T12:00:00'))
  })

  afterEach(() => vi.useRealTimers())

  it('keeps selected and future presentation on the month-grid wrapper', () => {
    const tokens = createTokensV2('purple', 'dark')
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={[gridDay('2026-09-10'), gridDay('2026-09-12')]}
          weekdayHeaders={[
            { key: 'sun', label: 'S' },
            { key: 'mon', label: 'M' },
            { key: 'tue', label: 'T' },
            { key: 'wed', label: 'W' },
            { key: 'thu', label: 'T' },
            { key: 'fri', label: 'F' },
            { key: 'sat', label: 'S' },
          ]}
          selectedDay="2026-09-10"
          isLoading={false}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    expect(tree.root.findByProps({ testID: 'calendar-future-day-2026-09-12' })).toBeTruthy()
    expect(tree.root.findAll((node: { type: unknown; props: { children?: unknown } }) => node.type === 'Text' && node.props.children === 12)).toHaveLength(1)
    const selectedSlot = tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-10' })
    expect(StyleSheet.flatten(selectedSlot.props.style as StyleProp<ViewStyle>)).toMatchObject({
      backgroundColor: tokens.primaryDim,
      borderColor: tokens.primary,
      borderWidth: 2,
    })
  })
})
