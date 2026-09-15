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
  it('renders the positive goal count with its specific label and caption', () => {
    const recapWithGoalCompletions = { ...recap, goalCompletions: 4 }
    const goals = buildWrappedSlides(recapWithGoalCompletions).find((slide) => slide.id === 'goals')!
    renderSlide(goals)

    const slide = screen.getByTestId('wrapped-slide-goals')
    expect(slide).toHaveTextContent('4')
    expect(slide).toHaveTextContent('shareCard.stats.goalsClosed')
    expect(slide).toHaveTextContent('wrapped.slides.goals.some:{"count":4}')
  })

  it('renders the zero goal caption under the specific label', () => {
    const recapWithNoGoalCompletions = { ...recap, goalCompletions: 0 }
    const goals = buildWrappedSlides(recapWithNoGoalCompletions).find((slide) => slide.id === 'goals')!
    renderSlide(goals)

    const slide = screen.getByTestId('wrapped-slide-goals')
    expect(slide).toHaveTextContent('shareCard.stats.goalsClosed')
    expect(slide).toHaveTextContent('wrapped.slides.goals.zero')
    expect(slide).not.toHaveTextContent('wrapped.slides.goals.some')
  })

  it('renders the weekday average as Monday-first Columns with initials and no date copy', () => {
    const consistency = buildWrappedSlides(recap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    expect(screen.getByTestId('weekday-columns')).toBeInTheDocument()
    expect(screen.getByTestId('weekday-columns')).toHaveTextContent(
      'dates.daysShort.mondaydates.daysShort.tuesdaydates.daysShort.wednesdaydates.daysShort.thursdaydates.daysShort.fridaydates.daysShort.saturdaydates.daysShort.sunday',
    )
  })

  it('names only the strongest weekday when one maximum stands alone', () => {
    const comparisonRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [0, 20, 0, 0, 60, 0, 0] }),
    })
    const consistency = buildWrappedSlides(comparisonRecap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    const summary = screen.getByText(/^wrapped\.slides\.consistency\.summary:/)
    expect(summary).toHaveTextContent(
      'wrapped.slides.consistency.summary:{"strong":"dates.daysShort.friday"}',
    )
    expect(summary).not.toHaveTextContent('dates.daysShort.tuesday')
    expect(screen.getByTestId('wrapped-slide-consistency')).toHaveTextContent('wrapped.slides.consistency.note')
  })

  it('explains that no logged weekday is too thin to compare', () => {
    const thinRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [0, 0, 0, 0, 0, 0, 0] }),
    })
    const consistency = buildWrappedSlides(thinRecap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    const slide = screen.getByTestId('wrapped-slide-consistency')
    expect(slide).toHaveTextContent('wrapped.slides.consistency.thin')
    expect(slide).not.toHaveTextContent('wrapped.slides.consistency.summary')
  })

  it('explains equal logged weekdays without naming one as strongest and quietest', () => {
    const evenRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [50, 50, 0, 0, 0, 0, 0] }),
    })
    const consistency = buildWrappedSlides(evenRecap).find((slide) => slide.id === 'consistency')!
    renderSlide(consistency)

    const slide = screen.getByTestId('wrapped-slide-consistency')
    expect(slide).toHaveTextContent('wrapped.slides.consistency.even')
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
