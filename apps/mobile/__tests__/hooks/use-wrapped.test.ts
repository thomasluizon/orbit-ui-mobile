import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { gamificationKeys } from '@orbit/shared/query'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { buildWrappedSlides } from '@orbit/shared/utils'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { useWrapped, useWrappedStory } from '@/hooks/use-wrapped'

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  useQuery: vi.fn(),
  reportEvent: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/hooks/use-gamification', () => ({
  useReportEvent: () => ({ mutate: mocks.reportEvent }),
}))

const TestRenderer = require('react-test-renderer')

type Story = ReturnType<typeof useWrappedStory>
type WrappedApi = ReturnType<typeof useWrapped>

interface WrappedQueryOptions {
  queryKey: readonly unknown[]
  queryFn: () => Promise<unknown>
  enabled: boolean
}

function firstQueryOptions(): WrappedQueryOptions {
  const call = mocks.useQuery.mock.calls[0]
  if (!call) throw new Error('useQuery was not called')
  return call[0] as WrappedQueryOptions
}

function renderStory(slideCount: number) {
  const ref: { current: Story | null } = { current: null }

  function Harness() {
    ref.current = useWrappedStory(slideCount)
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })

  if (!ref.current) {
    throw new Error('Expected useWrappedStory to initialize')
  }

  return ref as { current: Story }
}

const mountedTrees: { unmount: () => void }[] = []

async function renderWrapped(
  period: Parameters<typeof useWrapped>[0],
  options: Parameters<typeof useWrapped>[1] = {},
): Promise<{ current: WrappedApi }> {
  const ref: { current: WrappedApi | null } = { current: null }

  function Harness() {
    ref.current = useWrapped(period, options)
    return null
  }

  let tree: { unmount: () => void } | null = null
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(React.createElement(Harness))
    await Promise.resolve()
    await Promise.resolve()
  })

  if (!ref.current || !tree) throw new Error('useWrapped did not render')
  mountedTrees.push(tree)
  return ref as { current: WrappedApi }
}

describe('mobile useWrapped', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset().mockResolvedValue(createMockRecap())
    mocks.useQuery.mockReset().mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mocks.reportEvent.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    while (mountedTrees.length > 0) {
      const tree = mountedTrees.pop()
      TestRenderer.act(() => tree?.unmount())
    }
  })

  it('builds the recap query key and validates the fetched payload in the query fn', async () => {
    const recap = createMockRecap({ period: 'year' })
    mocks.apiClient.mockResolvedValue(recap)
    await renderWrapped('year')

    const options = firstQueryOptions()
    expect(options.queryKey).toEqual(gamificationKeys.recap('year'))
    expect(options.enabled).toBe(true)

    const parsed = await options.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/gamification/recap?period=year')
    expect(parsed).toMatchObject({ period: 'year' })
  })

  it('respects an explicit enabled: false flag', async () => {
    await renderWrapped('week', { enabled: false })
    expect(firstQueryOptions().enabled).toBe(false)
  })

  it('derives slides and a populated empty flag from a non-empty recap', async () => {
    const recap = createMockRecap()
    mocks.useQuery.mockReturnValue({
      data: recap,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    const api = await renderWrapped('month')
    expect(api.current.recap).toBe(recap)
    expect(api.current.slides).toEqual(buildWrappedSlides(recap))
    expect(api.current.isEmpty).toBe(false)
  })

  it('marks an all-zero recap as empty', async () => {
    const emptyRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }),
    })
    mocks.useQuery.mockReturnValue({
      data: emptyRecap,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    const api = await renderWrapped('year', { active: true })
    expect(api.current.isEmpty).toBe(true)
    expect(mocks.reportEvent).not.toHaveBeenCalled()
  })

  it('reports the wrapped-viewed achievement once for a fresh active year recap', async () => {
    const getItem = vi.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null)
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({ period: 'year' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    await renderWrapped('year', { active: true })

    expect(getItem).toHaveBeenCalledWith('orbit_wrapped_year_seen')
    expect(setItem).toHaveBeenCalledWith('orbit_wrapped_year_seen', '1')
    expect(mocks.reportEvent).toHaveBeenCalledWith(ACHIEVEMENT_EVENT_KEYS.wrappedViewed)
  })

  it('does not re-report when the year recap was already seen', async () => {
    const setItem = vi.spyOn(AsyncStorage, 'setItem').mockResolvedValue(undefined)
    vi.spyOn(AsyncStorage, 'getItem').mockResolvedValue('1')
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({ period: 'year' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    await renderWrapped('year', { active: true })

    expect(setItem).not.toHaveBeenCalled()
    expect(mocks.reportEvent).not.toHaveBeenCalled()
  })

  it('skips the achievement side effect when the player is not actively viewing', async () => {
    const getItem = vi.spyOn(AsyncStorage, 'getItem').mockResolvedValue(null)
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({ period: 'year' }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    await renderWrapped('year', { active: false })

    expect(getItem).not.toHaveBeenCalled()
    expect(mocks.reportEvent).not.toHaveBeenCalled()
  })
})

describe('mobile useWrappedStory', () => {
  it('opens on the first slide', () => {
    const story = renderStory(7)
    expect(story.current.index).toBe(0)
    expect(story.current.isFirst).toBe(true)
    expect(story.current.isLast).toBe(false)
  })

  it('advances to the last slide and clamps at the end', () => {
    const story = renderStory(3)

    TestRenderer.act(() => story.current.next())
    expect(story.current.index).toBe(1)

    TestRenderer.act(() => story.current.next())
    expect(story.current.index).toBe(2)
    expect(story.current.isLast).toBe(true)

    TestRenderer.act(() => story.current.next())
    expect(story.current.index).toBe(2)
  })

  it('steps back and clamps at the first slide', () => {
    const story = renderStory(3)

    TestRenderer.act(() => story.current.next())
    TestRenderer.act(() => story.current.prev())
    expect(story.current.index).toBe(0)
    expect(story.current.isFirst).toBe(true)

    TestRenderer.act(() => story.current.prev())
    expect(story.current.index).toBe(0)
  })

  it('lands on the share slide as the final step of a full recap story', () => {
    const slides = buildWrappedSlides(createMockRecap())
    const story = renderStory(slides.length)

    for (let step = 0; step < slides.length - 1; step += 1) {
      TestRenderer.act(() => story.current.next())
    }

    expect(story.current.isLast).toBe(true)
    expect(slides[story.current.index]?.id).toBe('share')
  })

  it('keeps the share slide last when there are no top habits', () => {
    const slides = buildWrappedSlides(
      createMockRecap({ metrics: createMockRetrospectiveMetrics({ topHabits: [] }) }),
    )

    expect(slides).toHaveLength(6)
    expect(slides.at(-1)?.id).toBe('share')
  })
})
