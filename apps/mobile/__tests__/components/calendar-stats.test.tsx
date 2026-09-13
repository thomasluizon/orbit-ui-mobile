import React from 'react'
import { describe, expect, it } from 'vitest'
import { CalendarStats } from '@/app/(tabs)/calendar/_components/calendar-stats'

const TestRenderer = require('react-test-renderer')

const stats = [
  { key: 'bestStreak', emoji: '🔥', value: 0, label: 'Best streak' },
  { key: 'totalLogs', emoji: '✅', value: 0, label: 'Total logs' },
  { key: 'missed', emoji: '⚠️', value: 0, label: 'Missed' },
] as const

describe('CalendarStats (mobile)', () => {
  it('uses each tile own loading state', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarStats stats={stats} state="loading" loadingLabel="Loading" />,
      )
    })

    expect(tree.root.findAll((node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === 'progressbar' &&
      node.props.accessibilityLabel === 'Loading',
    )).toHaveLength(3)
    expect(tree.root.findAll((node) => node.props.children === 0)).toHaveLength(0)
  })

  it('states no data instead of zero for an empty month', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarStats stats={stats} state="empty" emptyLabel="no data" />,
      )
    })

    expect(tree.root.findAll((node) =>
      typeof node.type === 'string' && node.props.children === 'no data',
    )).toHaveLength(3)
    expect(tree.root.findAll((node) => node.props.children === 0)).toHaveLength(0)
  })
})
