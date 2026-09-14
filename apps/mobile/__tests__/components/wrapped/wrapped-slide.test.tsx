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
})
