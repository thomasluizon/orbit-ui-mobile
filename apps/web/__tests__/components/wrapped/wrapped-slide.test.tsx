import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'

const motionTestState = vi.hoisted(() => ({ reduced: false }))

vi.mock('motion/react', async () => {
  const ReactModule = await import('react')
  const motion = new Proxy({}, {
    get: (_target, tag: string) => function MotionElement({
      initial,
      animate,
      transition,
      ...props
    }: Readonly<Record<string, unknown>>) {
      return ReactModule.createElement(tag, {
        ...props,
        'data-motion-initial': JSON.stringify(initial),
        'data-motion-animate': JSON.stringify(animate),
        'data-motion-transition': JSON.stringify(transition),
      })
    },
  })
  return { motion, useReducedMotion: () => motionTestState.reduced }
})

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
      savedFileName={null}
    />,
  )
}

describe('WrappedSlide', () => {
  afterEach(() => {
    motionTestState.reduced = false
  })

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
  it('renders the share failure state without leaving the final page blank', () => {
    const share = buildWrappedSlides(recap).find((slide) => slide.id === 'share')!
    render(
      <WrappedSlide
        slide={share}
        recap={recap}
        period="week"
        captureRef={{ current: null }}
        shareError
        savedFileName={null}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('shareCard.shareError')
    expect(screen.getByTestId('share-card')).toBeInTheDocument()
  })

  it('states the file name after the share card is saved', () => {
    const share = buildWrappedSlides(recap).find((slide) => slide.id === 'share')!
    render(
      <WrappedSlide
        slide={share}
        recap={recap}
        period="week"
        captureRef={{ current: null }}
        shareError={false}
        savedFileName="orbit-recap.png"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'shareCard.saved:{"file":"orbit-recap.png"}',
    )
  })

  it('keeps an empty save status mounted before a file is saved', () => {
    const share = buildWrappedSlides(recap).find((slide) => slide.id === 'share')!
    renderSlide(share)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('starts every page part 16px low at full opacity on the shared timing scale', () => {
    const intro = buildWrappedSlides(recap).find((slide) => slide.id === 'intro')!
    renderSlide(intro)

    const parts = screen.getAllByTestId('wrapped-motion-part')
    expect(parts).toHaveLength(3)
    for (const [index, part] of parts.entries()) {
      expect(JSON.parse(part.dataset.motionInitial!)).toEqual({ y: 16, opacity: 1 })
      expect(JSON.parse(part.dataset.motionAnimate!)).toEqual({ y: 0, opacity: 1 })
      expect(JSON.parse(part.dataset.motionTransition!)).toMatchObject({ duration: 0.28, delay: index * 0.04 })
    }
  })

  it('sweeps the streak ring exactly once on each page arrival', () => {
    const streak = buildWrappedSlides(recap).find((slide) => slide.id === 'streak')!
    const firstArrival = renderSlide(streak)

    assertStreakRingSweep()
    firstArrival.unmount()
    renderSlide(streak)
    assertStreakRingSweep()
  })

  it('animates page entry with transform and opacity only', () => {
    const intro = buildWrappedSlides(recap).find((slide) => slide.id === 'intro')!
    renderSlide(intro)

    for (const part of screen.getAllByTestId('wrapped-motion-part')) {
      expect(new Set(Object.keys(JSON.parse(part.dataset.motionInitial!)))).toEqual(new Set(['opacity', 'y']))
      expect(new Set(Object.keys(JSON.parse(part.dataset.motionAnimate!)))).toEqual(new Set(['opacity', 'y']))
    }
  })

  it('renders the reduced-motion page at its final state without rise, stagger, or sweep', () => {
    motionTestState.reduced = true
    const streak = buildWrappedSlides(recap).find((slide) => slide.id === 'streak')!
    renderSlide(streak)

    for (const part of screen.getAllByTestId('wrapped-motion-part')) {
      expect(JSON.parse(part.dataset.motionInitial!)).toBe(false)
      expect(JSON.parse(part.dataset.motionAnimate!)).toEqual({ y: 0, opacity: 1 })
      expect(part.dataset.motionTransition).toBeUndefined()
    }
    const ring = screen.getByTestId('wrapped-streak-ring')
    expect(JSON.parse(ring.dataset.motionInitial!)).toBe(false)
    expect(JSON.parse(ring.dataset.motionAnimate!)).toEqual({ pathLength: 1 })
    expect(ring.dataset.motionTransition).toBeUndefined()
  })
})

function assertStreakRingSweep() {
  const ring = screen.getByTestId('wrapped-streak-ring')
  expect(JSON.parse(ring.dataset.motionInitial!)).toEqual({ pathLength: 0 })
  expect(JSON.parse(ring.dataset.motionAnimate!)).toEqual({ pathLength: 1 })
  expect(JSON.parse(ring.dataset.motionTransition!)).toEqual({
    duration: 0.28,
    delay: 0.04,
    ease: [0.16, 1, 0.3, 1],
  })
}
