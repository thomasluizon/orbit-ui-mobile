import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { WrappedSlide } from '@/components/wrapped/wrapped-slide'
import { reanimatedTestState, withTimingCalls } from '@/test-mocks/react-native-reanimated'

vi.mock('@/components/share/share-card', () => ({
  ShareCard: () => React.createElement('ShareCard'),
}))

vi.mock('@/components/ui/columns', () => ({
  Columns: ({ columns }: Readonly<{ columns: { id: string; label: string; value: number }[] }>) =>
    React.createElement('Columns', { testID: 'weekday-columns', columns }),
}))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const recap = createMockRecap({
  metrics: createMockRetrospectiveMetrics({
    weeklyConsistency: [10, 20, 30, 40, 50, 60, 70],
  }),
})
const tokens = new Proxy({}, { get: () => '#111111' }) as Parameters<typeof WrappedSlide>[0]['tokens']

function renderSlide(slide: ReturnType<typeof buildWrappedSlides>[number]) {
  let tree!: ReactTestRenderer
  void renderer.act(() => {
    tree = renderer.create(
      <WrappedSlide
        slide={slide}
        recap={recap}
        period="week"
        tokens={tokens}
        shareRef={{ current: null }}
        shareError={false}
      />,
    )
  })
  return tree
}

describe('mobile WrappedSlide', () => {
  afterEach(() => {
    reanimatedTestState.reducedMotion = false
    withTimingCalls.length = 0
  })

  it('renders the weekday average as Monday-first Columns with initials and no date copy', () => {
    const consistency = buildWrappedSlides(recap).find((slide) => slide.id === 'consistency')!
    const tree = renderSlide(consistency)
    const columns = tree.root.findAll((node) => node.props.testID === 'weekday-columns')[0]!
    const columnProps = columns.props as { columns: { label: string }[] }

    expect(columnProps.columns.map((column) => column.label)).toEqual([
      'dates.daysShort.monday',
      'dates.daysShort.tuesday',
      'dates.daysShort.wednesday',
      'dates.daysShort.thursday',
      'dates.daysShort.friday',
      'dates.daysShort.saturday',
      'dates.daysShort.sunday',
    ])
    expect(tree.root.findAll((node) => node.props.children === 'wrapped.slides.consistency.caption')).toHaveLength(0)
  })

  it('gives every page exactly one focal figure', () => {
    for (const slide of buildWrappedSlides(recap)) {
      const tree = renderSlide(slide)
      expect(
        tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-figure'),
        slide.id,
      ).toHaveLength(1)
      tree.update(<></>)
    }
  })

  it('renders the share failure state without leaving the final page blank', () => {
    const share = buildWrappedSlides(recap).find((slide) => slide.id === 'share')!
    let tree!: ReactTestRenderer
    void renderer.act(() => {
      tree = renderer.create(
        <WrappedSlide
          slide={share}
          recap={recap}
          period="week"
          tokens={tokens}
          shareRef={{ current: null }}
          shareError
        />,
      )
    })

    expect(
      tree.root.findAll(
        (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert',
      ),
    ).toHaveLength(1)
    expect(tree.root.findAll((node) => String(node.type) === 'ShareCard')).toHaveLength(1)
  })

  it('starts every page part 16px low at full opacity on the shared timing scale', () => {
    const intro = buildWrappedSlides(recap).find((slide) => slide.id === 'intro')!
    const tree = renderSlide(intro)
    const parts = tree.root.findAll((node) => (
      typeof node.type === 'string' && String(node.props.nativeID).startsWith('wrapped-motion-part-')
    ))

    expect(parts).toHaveLength(3)
    for (const [index, part] of parts.entries()) {
      expect(part.props.entering).toMatchObject({
        definitions: {
          0: { opacity: 1, transform: [{ translateY: 16 }] },
          100: { opacity: 1, transform: [{ translateY: 0 }] },
        },
        durationMs: 280,
        delayMs: index * 40,
      })
    }
  })

  it('sweeps the streak ring exactly once on each page arrival', () => {
    const streak = buildWrappedSlides(recap).find((slide) => slide.id === 'streak')!
    const firstArrival = renderSlide(streak)

    expect(firstArrival.root.findAll((node) => node.props.testID === 'wrapped-streak-ring')).toHaveLength(2)
    expect(withTimingCalls).toHaveLength(1)
    expect(withTimingCalls[0]).toMatchObject({ value: 0, config: { duration: 280 } })
    firstArrival.update(<></>)
    const secondArrival = renderSlide(streak)
    expect(secondArrival.root.findAll((node) => node.props.testID === 'wrapped-streak-ring')).toHaveLength(2)
    expect(withTimingCalls).toHaveLength(2)
  })

  it('animates page entry with transform and opacity only', () => {
    const intro = buildWrappedSlides(recap).find((slide) => slide.id === 'intro')!
    const tree = renderSlide(intro)

    const parts = tree.root.findAll((node) => (
      typeof node.type === 'string' && String(node.props.nativeID).startsWith('wrapped-motion-part-')
    ))
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      const entering = part.props.entering as { definitions: Record<number, Record<string, unknown>> }
      expect(new Set(Object.keys(entering.definitions[0]!))).toEqual(new Set(['opacity', 'transform']))
      expect(new Set(Object.keys(entering.definitions[100]!))).toEqual(
        new Set(['easing', 'opacity', 'transform']),
      )
    }
  })

  it('renders the reduced-motion page at its final state without rise, stagger, or sweep', () => {
    reanimatedTestState.reducedMotion = true
    const streak = buildWrappedSlides(recap).find((slide) => slide.id === 'streak')!
    const tree = renderSlide(streak)
    const parts = tree.root.findAll((node) => (
      typeof node.type === 'string' && String(node.props.nativeID).startsWith('wrapped-motion-part-')
    ))

    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      expect(part.props.entering).toBeUndefined()
      const partStyles = Array.isArray(part.props.style) ? part.props.style : [part.props.style]
      expect(partStyles).toEqual(expect.arrayContaining([
        expect.objectContaining({ opacity: 1, transform: [{ translateY: 0 }] }),
      ]))
    }
    const ring = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'wrapped-streak-ring',
    )[0]!
    expect((ring.props.animatedProps as { strokeDashoffset: number }).strokeDashoffset).toBe(0)
    expect(withTimingCalls).toHaveLength(0)
  })
})
