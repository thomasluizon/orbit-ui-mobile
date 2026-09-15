import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { WrappedSlide } from '@/components/wrapped/wrapped-slide'

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
})
