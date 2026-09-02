import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HabitDetailRoute from '@/app/habits/[id]'

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
  HabitDetailScreen: (props: { date: string }) => React.createElement('HabitDetailScreen', props),
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
  ])('falls back before rendering malformed or repeated input %#', (date) => {
    mocks.params = { id: 'habit-1', date }
    let tree: ReturnType<typeof TestRenderer.create>

    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailRoute />)
    })

    expect(tree!.root.findByType('HabitDetailScreen').props.date).toBe('2026-08-30')
  })
})
