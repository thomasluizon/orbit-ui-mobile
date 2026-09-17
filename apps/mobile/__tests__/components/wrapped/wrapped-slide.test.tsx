import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { WrappedSlide } from '@/components/wrapped/wrapped-slide'
import {
  reanimatedTestState,
  withDelayCalls,
  withTimingCalls,
} from '@/test-mocks/react-native-reanimated'

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
        savedFileName={null}
      />,
    )
  })
  return tree
}

describe('mobile WrappedSlide', () => {
  afterEach(() => {
    reanimatedTestState.reducedMotion = false
    withDelayCalls.length = 0
    withTimingCalls.length = 0
  })

  it('renders the positive goal count with its specific label and caption', () => {
    const recapWithGoalCompletions = { ...recap, goalCompletions: 4 }
    const goals = buildWrappedSlides(recapWithGoalCompletions).find((slide) => slide.id === 'goals')!
    const tree = renderSlide(goals)
    const figure = tree.root.findAll((node) => node.props.testID === 'wrapped-figure')[0]!

    expect(figure.props.children).toBe(4)
    expect(tree.root.findAll((node) => node.props.children === 'shareCard.stats.goalsClosed')[0]).toBeTruthy()
    expect(
      tree.root.findAll((node) => node.props.children === 'wrapped.slides.goals.some:{"count":4}')[0],
    ).toBeTruthy()
  })

  it('renders the zero goal caption under the specific label', () => {
    const recapWithNoGoalCompletions = { ...recap, goalCompletions: 0 }
    const goals = buildWrappedSlides(recapWithNoGoalCompletions).find((slide) => slide.id === 'goals')!
    const tree = renderSlide(goals)

    expect(tree.root.findAll((node) => node.props.children === 'shareCard.stats.goalsClosed')[0]).toBeTruthy()
    expect(tree.root.findAll((node) => node.props.children === 'wrapped.slides.goals.zero')[0]).toBeTruthy()
    expect(
      tree.root.findAll((node) =>
        typeof node.props.children === 'string' && node.props.children.startsWith('wrapped.slides.goals.some')),
    ).toHaveLength(0)
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
  })

  it('names only the strongest weekday when one maximum stands alone', () => {
    const comparisonRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [0, 20, 0, 0, 60, 0, 0] }),
    })
    const consistency = buildWrappedSlides(comparisonRecap).find((slide) => slide.id === 'consistency')!
    const tree = renderSlide(consistency)

    expect(
      tree.root.findAll((node) =>
        node.props.children ===
        'wrapped.slides.consistency.summary:{"strong":"dates.daysShort.friday"}')[0],
    ).toBeTruthy()
    expect(
      tree.root.findAll((node) =>
        typeof node.props.children === 'string' && node.props.children.includes('dates.daysShort.tuesday')),
    ).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.children === 'wrapped.slides.consistency.note')[0]).toBeTruthy()
  })

  it('explains that no logged weekday is too thin to compare', () => {
    const thinRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [0, 0, 0, 0, 0, 0, 0] }),
    })
    const consistency = buildWrappedSlides(thinRecap).find((slide) => slide.id === 'consistency')!
    const tree = renderSlide(consistency)

    expect(tree.root.findAll((node) => node.props.children === 'wrapped.slides.consistency.thin')[0]).toBeTruthy()
    expect(
      tree.root.findAll((node) =>
        typeof node.props.children === 'string' &&
        node.props.children.startsWith('wrapped.slides.consistency.summary')),
    ).toHaveLength(0)
  })

  it('explains equal logged weekdays without naming one as strongest and quietest', () => {
    const evenRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [50, 50, 0, 0, 0, 0, 0] }),
    })
    const consistency = buildWrappedSlides(evenRecap).find((slide) => slide.id === 'consistency')!
    const tree = renderSlide(consistency)

    expect(
      tree.root.findAll((node) => node.props.children === 'wrapped.slides.consistency.even')[0],
    ).toBeTruthy()
    expect(
      tree.root.findAll((node) =>
        typeof node.props.children === 'string' &&
        node.props.children.startsWith('wrapped.slides.consistency.summary')),
    ).toHaveLength(0)
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
          savedFileName={null}
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

  it('states the file name after the share card is saved', () => {
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
          shareError={false}
          savedFileName="orbit-recap.png"
        />,
      )
    })

    const status = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite',
    )
    expect(status).toHaveLength(1)
    expect(status[0]!.props.children).toBe('shareCard.saved:{"file":"orbit-recap.png"}')
  })

  it('keeps an empty save status mounted before a file is saved', () => {
    const share = buildWrappedSlides(recap).find((slide) => slide.id === 'share')!
    const tree = renderSlide(share)

    const status = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite',
    )
    expect(status).toHaveLength(1)
    expect(status[0]!.props.children).toBe('')
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
    expect(withDelayCalls).toEqual([{ delayMs: 40, value: 0 }])
    firstArrival.update(<></>)
    const secondArrival = renderSlide(streak)
    expect(secondArrival.root.findAll((node) => node.props.testID === 'wrapped-streak-ring')).toHaveLength(2)
    expect(withTimingCalls).toHaveLength(2)
    expect(withDelayCalls).toEqual([
      { delayMs: 40, value: 0 },
      { delayMs: 40, value: 0 },
    ])
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
    expect(withDelayCalls).toHaveLength(0)
  })
})
