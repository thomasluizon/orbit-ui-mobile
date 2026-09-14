import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/components/share/share-card', () => ({
  ShareCard: () => <div data-testid="share-card" />,
}))

vi.mock('@/components/ui/columns', () => ({
  Columns: ({ columns }: Readonly<{ columns: { id: string; label: string; value: number }[] }>) => (
    <div data-testid="weekday-columns">
      {columns.map((column) => <span key={column.id}>{column.label}</span>)}
    </div>
  ),
}))

import { WrappedSlide } from '@/app/(app)/wrapped/_components/wrapped-slide'

const recap = createMockRecap({
  metrics: createMockRetrospectiveMetrics({
    weeklyConsistency: [10, 20, 30, 40, 50, 60, 70],
  }),
})

function renderSlide(slide: ReturnType<typeof buildWrappedSlides>[number]) {
  return render(
    <WrappedSlide
      slide={slide}
      recap={recap}
      period="week"
      captureRef={{ current: null }}
      shareError={false}
    />,
  )
}

describe('WrappedSlide', () => {
  it('renders the nonzero goal completion count from the recap', () => {
    const recapWithGoalCompletions = { ...recap, goalCompletions: 4 }
    const goals = buildWrappedSlides(recapWithGoalCompletions).find((slide) => slide.id === 'goals')!
    renderSlide(goals)

    expect(screen.getByTestId('wrapped-slide-goals')).toHaveTextContent('4')
  })

  it('explains a zero goal completion count without renaming its label', () => {
    const recapWithNoGoalCompletions = { ...recap, goalCompletions: 0 }
    const goals = buildWrappedSlides(recapWithNoGoalCompletions).find((slide) => slide.id === 'goals')!
    renderSlide(goals)

    const slide = screen.getByTestId('wrapped-slide-goals')
    expect(slide).toHaveTextContent('progressScreen.sections.goals')
    expect(slide).toHaveTextContent('wrapped.slides.goals.zero')
  })

  it('renders the weekday average as Monday-first Columns with initials and no date copy', () => {
    const consistency = buildWrappedSlides(recap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    expect(screen.getByTestId('weekday-columns')).toBeInTheDocument()
    expect(screen.getByTestId('weekday-columns')).toHaveTextContent(
      'dates.daysShort.mondaydates.daysShort.tuesdaydates.daysShort.wednesdaydates.daysShort.thursdaydates.daysShort.fridaydates.daysShort.saturdaydates.daysShort.sunday',
    )
    expect(screen.queryByText('wrapped.slides.consistency.caption')).not.toBeInTheDocument()
  })

  it('interprets exactly two logged weekdays and explains their averages', () => {
    const comparisonRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [0, 20, 0, 0, 0, 60, 0] }),
    })
    const consistency = buildWrappedSlides(comparisonRecap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    expect(screen.getByTestId('wrapped-slide-consistency')).toHaveTextContent(
      'wrapped.slides.consistency.summary:{"strong":"dates.daysShort.saturday","weak":"dates.daysShort.tuesday"}',
    )
    expect(screen.getByTestId('wrapped-slide-consistency')).toHaveTextContent('wrapped.slides.consistency.note')
  })

  it('explains that exactly one logged weekday is too thin to compare', () => {
    const thinRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [0, 20, 0, 0, 0, 0, 0] }),
    })
    const consistency = buildWrappedSlides(thinRecap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    const slide = screen.getByTestId('wrapped-slide-consistency')
    expect(slide).toHaveTextContent('wrapped.slides.consistency.thin')
    expect(slide).not.toHaveTextContent('wrapped.slides.consistency.summary')
  })

  it('gives every page exactly one focal figure', () => {
    for (const slide of buildWrappedSlides(recap)) {
      const view = renderSlide(slide)
      expect(view.container.querySelectorAll('[data-wrapped-figure]'), slide.id).toHaveLength(1)
      view.unmount()
    }
  })
})
