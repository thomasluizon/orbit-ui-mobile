import React from 'react'
import { StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarMonthDay } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { CalendarGrid } from '@/app/(tabs)/calendar/_components/calendar-grid'

interface TestNode {
  type: unknown
  props: Record<string, unknown> & { children?: unknown; style?: StyleProp<ViewStyle> }
}

interface TestTree {
  root: {
    findByProps(props: Record<string, unknown>): TestNode
    findAll(predicate: (node: TestNode) => boolean): TestNode[]
  }
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

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
    let tree!: TestTree
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

    const futureNumeral = tree.root.findByProps({ testID: 'calendar-future-day-2026-09-12' })
    expect(StyleSheet.flatten(futureNumeral.props.style)).toMatchObject({ color: tokens.fg2 })
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 12)).toHaveLength(1)
    const futureSlot = tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-12' })
    expect(StyleSheet.flatten(futureSlot.props.style)).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    })
    const selectedSlot = tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-10' })
    expect(StyleSheet.flatten(selectedSlot.props.style)).toMatchObject({
      width: 44,
      height: 44,
      backgroundColor: tokens.selectionBg,
    })
    expect(StyleSheet.flatten(selectedSlot.props.style)).not.toHaveProperty('borderWidth')
    const selectedRing = tree.root.findByProps({ testID: 'calendar-day-selection-2026-09-10' })
    expect(StyleSheet.flatten(selectedRing.props.style)).toMatchObject({
      position: 'absolute',
      inset: 0,
      borderColor: tokens.primary,
      borderWidth: 2,
    })
  })

  it('paints a range endpoint with one selection tint and one selected ring', () => {
    const tokens = createTokensV2('purple', 'dark')
    const endpoint = gridDay('2026-09-10')
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={[endpoint]}
          weekdayHeaders={[{ key: 'wednesday', label: 'W' }]}
          selectedDay={null}
          isLoading={false}
          rangeStart={endpoint.dateStr}
          rangeEnd={endpoint.dateStr}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    const tintedLayers = tree.root.findAll((node) => {
      if (typeof node.type !== 'string' || node.props.style == null) return false
      return StyleSheet.flatten(node.props.style).backgroundColor === tokens.selectionBg
    })
    const selectedRings = tree.root.findAll((node) => {
      if (typeof node.type !== 'string' || node.props.style == null) return false
      const style = StyleSheet.flatten(node.props.style)
      return style.borderColor === tokens.primary && style.borderWidth === 2
    })

    expect(tintedLayers).toHaveLength(1)
    expect(selectedRings).toHaveLength(1)
  })
})
