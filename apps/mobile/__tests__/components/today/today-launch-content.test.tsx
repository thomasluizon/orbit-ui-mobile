import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { View, Text } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { TodayLaunchContent } from '@/components/today/today-launch-content'
import { startTodayLaunch } from '@/lib/today-launch'

const TestRenderer = require('react-test-renderer')

const span = vi.hoisted(() => ({ setAttribute: vi.fn(), end: vi.fn() }))
vi.mock('@sentry/react-native', () => ({ startInactiveSpan: vi.fn(() => span) }))

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('native Hoje first content', () => {
  it.each([true, false])('ends after content layout with cached rows=%s', async (fromCache) => {
    vi.stubGlobal('performance', { timeOrigin: 10_000, rnStartupTiming: { startTime: 250 } })
    startTodayLaunch()
    expect(Sentry.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ startTime: 10.25, attributes: { 'app.start.source': 'native' } }))
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<TodayLaunchContent enabled fromCache={fromCache} empty={false}><Text>Habit</Text></TodayLaunchContent>) })
    try {
      expect(span.end).not.toHaveBeenCalled()
      await TestRenderer.act(() => tree.root.findByType(View).props.onLayout())
      expect(span.setAttribute).toHaveBeenCalledWith('today.from_cache', fromCache)
      expect(span.setAttribute).toHaveBeenCalledWith('today.empty', false)
      expect(span.end).toHaveBeenCalledOnce()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('ends on an empty layout and ignores later layouts', async () => {
    startTodayLaunch()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<TodayLaunchContent enabled fromCache={false} empty>{null}</TodayLaunchContent>) })
    try {
      await TestRenderer.act(() => { tree.root.findByType(View).props.onLayout(); tree.root.findByType(View).props.onLayout() })
      expect(span.setAttribute).toHaveBeenCalledWith('today.empty', true)
      expect(span.end).toHaveBeenCalledOnce()
    } finally { await TestRenderer.act(() => tree.unmount()) }
  })

  it('does not finish for another habit view', async () => {
    startTodayLaunch()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<TodayLaunchContent enabled={false} fromCache empty={false}><Text>Habit</Text></TodayLaunchContent>) })
    expect(tree.root.findAllByType(View)).toHaveLength(0)
    expect(span.end).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree.unmount())
  })
})
