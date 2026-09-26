import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HabitDetailRoute from '@/app/habits/[id]'
import { redirectSystemPath } from '@/app/+native-intent'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted((): {
  params: {
    id: string
    date?: string | string[]
  }
} => ({
  params: { id: 'habit-1', date: 'bad' },
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
}))

vi.mock('@/components/habits/habit-detail-screen', () => ({
  HabitDetailScreen: (props: { date: string | null }) => React.createElement('HabitDetailScreen', props),
}))

describe('habit detail route date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 30, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    'bad',
    ['2026-08-28', '2026-08-29'],
    undefined,
  ])('uses the account-day fallback for missing, malformed, or repeated input %#', (date) => {
    mocks.params = { id: 'habit-1', date }
    let tree: ReturnType<typeof TestRenderer.create>

    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailRoute />)
    })

    expect(tree!.root.findByType('HabitDetailScreen').props.date).toBeNull()
  })

  it.each(['2020-01-01', '2030-01-01'])('passes an external date to the habit screen: %s', (date) => {
    const link = `orbit://habits/habit-1?date=${date}`
    expect(redirectSystemPath({ path: link, initial: true })).toBe(link)
    mocks.params = { id: 'habit-1', date }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailRoute />) })
    expect(tree!.root.findByType('HabitDetailScreen').props.date).toBe(date)
  })
})
