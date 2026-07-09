import React from 'react'
import { describe, expect, it } from 'vitest'

import { HabitDetailStatsRow } from '@/components/habits/habit-detail-sections'
import { createTokensV2 } from '@/lib/theme'
const TestRenderer = require('react-test-renderer')

function findTextNodes(tree: ReturnType<typeof TestRenderer.create>, text: string) {
  return tree.root.findAll((node: { props: { children?: unknown } }) => {
    const props = node.props
    if (typeof props.children !== 'string') {
      return false
    }
    return props.children === text
  })
}

describe('HabitDetailStatsRow', () => {
  it('renders current streak, longest streak, and monthly rate', () => {
    let tree: ReturnType<typeof TestRenderer.create> | null = null
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitDetailStatsRow
          metrics={{
            currentStreak: 5,
            longestStreak: 14,
            monthlyCompletionRate: 85.5,
          }}
          loading={false}
          t={(key) => key}
          tokens={createTokensV2('purple', 'dark')}
        />,
      )
    })

    expect(tree).not.toBeNull()
    expect(findTextNodes(tree!, 'habits.detail.currentStreak').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, '5').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, '14').length).toBeGreaterThanOrEqual(1)
    expect(findTextNodes(tree!, '86%').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the empty state when there are no metrics', () => {
    let tree: ReturnType<typeof TestRenderer.create> | null = null
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitDetailStatsRow
          metrics={null}
          loading={false}
          t={(key) => key}
          tokens={createTokensV2('purple', 'dark')}
        />,
      )
    })

    expect(findTextNodes(tree!, 'habits.detail.noDataYet').length).toBeGreaterThanOrEqual(1)
  })
})
