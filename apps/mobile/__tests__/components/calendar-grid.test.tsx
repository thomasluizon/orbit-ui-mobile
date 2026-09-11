import React from 'react'
import { StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { CalendarGrid, type GridDay } from '@/app/(tabs)/calendar/_components/calendar-grid'
import { createTokensV2 } from '@/lib/theme'

interface TestNode {
  type: unknown
  props: Record<string, unknown> & { style?: StyleProp<ViewStyle> }
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

const rangeEndpoint: GridDay = {
  date: new Date(2025, 5, 16),
  dateStr: '2025-06-16',
  day: 16,
  isCurrentMonth: true,
  isToday: false,
  entries: [],
  completedCount: 0,
  totalCount: 0,
  completionRatio: 0,
}

describe('CalendarGrid selection tint (mobile)', () => {
  it('paints a selected range endpoint with one selection tint and keeps its ring', () => {
    const tokens = createTokensV2('purple', 'dark')
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={[rangeEndpoint]}
          weekdayHeaders={[{ key: 'monday', label: 'M' }]}
          selectedDay={null}
          isLoading={false}
          rangeStart={rangeEndpoint.dateStr}
          rangeEnd={rangeEndpoint.dateStr}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    const tintedLayers = tree.root.findAll((node) => {
      if (typeof node.type !== 'string') return false
      if (node.props.style == null) return false
      const style = StyleSheet.flatten(node.props.style)
      return style.backgroundColor === tokens.selectionBg
    })
    const selectedRings = tree.root.findAll((node) => {
      if (typeof node.type !== 'string') return false
      if (node.props.style == null) return false
      const style = StyleSheet.flatten(node.props.style)
      return style.borderColor === tokens.primary && style.borderWidth === 2
    })

    expect(tintedLayers).toHaveLength(1)
    expect(selectedRings).toHaveLength(1)
  })
})
