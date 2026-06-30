import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildWrappedSlides } from '@orbit/shared/utils'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { useWrappedStory } from '@/hooks/use-wrapped'

vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))

const TestRenderer = require('react-test-renderer')

type Story = ReturnType<typeof useWrappedStory>

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
