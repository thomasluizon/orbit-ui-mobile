import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile, createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const profileState = vi.hoisted<{ weekStartDay: 0 | 1 | undefined; isError: boolean; refetch: ReturnType<typeof vi.fn> }>(() => ({ weekStartDay: 1, isError: false, refetch: vi.fn() }))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: profileState.weekStartDay === undefined ? undefined : createMockProfile({ weekStartDay: profileState.weekStartDay }),
    isError: profileState.isError,
    refetch: profileState.refetch,
  }),
}))

const motionTestState = vi.hoisted(() => ({ reduced: false, realLocale: '' }))

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

vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return {
    ...actual,
    useTranslations: () => (key: string, params?: Record<string, unknown>) => {
      if (motionTestState.realLocale) {
        const locale = motionTestState.realLocale
        const translate = actual.createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
        return translate(key as Parameters<typeof translate>[0], params as Record<string, string | number | Date> | undefined)
      }
      return params ? `${key}:${JSON.stringify(params)}` : key
    },
  }
})

vi.mock('@/components/share/share-card', () => ({
  ShareCard: () => <div data-testid="share-card" />,
}))

import { WrappedSlide } from '@/app/(app)/wrapped/_components/wrapped-slide'

const recap = createMockRecap({
  metrics: createMockRetrospectiveMetrics({
    weeklyConsistency: [10, 20, 30, 40, 50, 60, 70],
  }),
})

function renderSlide(
  slide: ReturnType<typeof buildWrappedSlides>[number],
  period: 'week' | 'month' | 'year' = 'week',
  storyRecap = recap,
  weekStartDay: 0 | 1 | null = 1,
) {
  profileState.weekStartDay = weekStartDay ?? undefined
  return render(
    <WrappedSlide
      slide={slide}
      recap={storyRecap}
      period={period}
      captureRef={{ current: null }}
      shareError={false}
      savedFileName={null}
    />,
  )
}

describe('WrappedSlide', () => {
  beforeEach(() => {
    profileState.weekStartDay = 1
    profileState.isError = false
    profileState.refetch.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 4, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
    motionTestState.reduced = false
    motionTestState.realLocale = ''
  })

  it.each(['en', 'pt-BR'])('uses full weekday names in the %s sentence', (locale) => {
    motionTestState.realLocale = locale
    const messages = locale === 'en' ? en : ptBR
    for (const [index, weekday] of Object.keys(messages.dates.daysLong).entries()) {
      const weeklyConsistency = Array.from({ length: 7 }, (_, day) => day === index ? 100 : 0)
      const view = renderSlide({ id: 'consistency', weeklyConsistency })
      const fullName = messages.dates.daysLong[weekday as keyof typeof messages.dates.daysLong]
      expect(screen.getByTestId('wrapped-slide-consistency')).toHaveTextContent(
        messages.wrapped.slides.consistency.summary.replace('{strong}', fullName),
      )
      view.unmount()
    }
  })

  it.each([['en', 0], ['pt-BR', 0], ['en', 100], ['pt-BR', 100]] as const)('marks future weekdays as not yet in %s with future value %i and keeps elapsed zeroes measured', (locale, futureValue) => {
    motionTestState.realLocale = locale
    vi.setSystemTime(new Date(2026, 9, 1, 12))
    const messages = locale === 'en' ? en : ptBR
    renderSlide(
      { id: 'consistency', weeklyConsistency: [70, 50, 0, 0, futureValue, futureValue, futureValue] },
      'week',
      createMockRecap({ metrics: createMockRetrospectiveMetrics({ periodDays: 4 }) }),
    )
    for (const weekday of ['friday', 'saturday', 'sunday'] as const) {
      const column = screen.getByRole('img', { name: `${messages.dates.daysShort[weekday]}: ${messages.calendar.dayCell.future}` })
      expect(column).toHaveTextContent(messages.calendar.dayCell.future)
      expect(column).not.toHaveTextContent('0')
    }
    expect(screen.getByRole('img', { name: `${messages.dates.daysShort.thursday}: 0` })).toHaveTextContent('0')
    expect(screen.getByTestId('wrapped-slide-consistency')).toHaveTextContent(
      messages.wrapped.slides.consistency.summary.replace('{strong}', messages.dates.daysLong.monday),
    )
  })

  it.each(([
    [0, 'Thursday', 5, [20, 20, 0, 20, null, null, 100]],
    [1, 'Thursday', 4, [20, 20, 0, 20, null, null, null]],
    [0, 'Sunday', 1, [null, null, null, null, null, null, 100]],
    [1, 'Sunday', 7, [20, 20, 0, 20, 0, 0, 100]],
  ] as const).flatMap(([weekStartDay, accountDay, periodDays, expected]) =>
    [false, true].map((deviceDateMismatch) => ({ weekStartDay, accountDay, periodDays, expected, deviceDateMismatch })),
  ))('uses the returned $weekStartDay-start window on $accountDay with device mismatch $deviceDateMismatch', ({ weekStartDay, accountDay, periodDays, expected, deviceDateMismatch }) => {
    motionTestState.realLocale = 'en'
    vi.setSystemTime(new Date(2026, 9, deviceDateMismatch ? 5 : accountDay === 'Thursday' ? 1 : 4, 12))
    const storyRecap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({
        periodDays,
        weeklyConsistency: [20, 20, 0, 20, 0, 0, 100],
      }),
    })
    const slide = buildWrappedSlides(storyRecap).find((entry) => entry.id === 'consistency')!
    renderSlide(slide, 'week', storyRecap, weekStartDay)
    const weekdays = Object.values(en.dates.daysShort)
    expect(screen.getAllByRole('img').map((column) => column.getAttribute('aria-label'))).toEqual(
      expected.map((value, index) => `${weekdays[index]}: ${value === null ? en.calendar.dayCell.future : value}`),
    )
    expect(screen.getByTestId('wrapped-slide-consistency')).toHaveTextContent(
      weekStartDay === 1 && accountDay === 'Thursday'
        ? en.wrapped.slides.consistency.even
        : en.wrapped.slides.consistency.summary.replace('{strong}', en.dates.daysLong.sunday),
    )
  })

  it.each([false, true])('withholds weekday claims while the profile is unavailable, error %s', (isError) => {
    profileState.isError = isError
    renderSlide({ id: 'consistency', weeklyConsistency: [100, 0, 0, 0, 0, 0, 0] }, 'week', recap, null)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByText('wrapped.slides.consistency.thin')).not.toBeInTheDocument()
    if (isError) {
      expect(screen.getByRole('alert')).toHaveTextContent('wrapped.error')
      fireEvent.click(screen.getByRole('button', { name: 'wrapped.retry' }))
      expect(profileState.refetch).toHaveBeenCalledOnce()
    } else {
      expect(screen.getByRole('progressbar', { name: 'wrapped.loading' })).toHaveAttribute('aria-busy', 'true')
    }
  })

  it.each(['month', 'year'] as const)('keeps all weekday averages available for a %s recap on Thursday', (period) => {
    vi.setSystemTime(new Date(2026, 9, 1, 12))
    renderSlide({ id: 'consistency', weeklyConsistency: [100, 50, 0, 0, 0, 0, 0] }, period)
    expect(screen.getByRole('img', { name: 'dates.daysShort.friday: 0' })).toHaveTextContent('0')
  })

  it('uses the leading edge and 60px figure for completions without a page eyebrow', () => {
    const completions = buildWrappedSlides(recap).find((slide) => slide.id === 'completions')!
    renderSlide(completions)
    const page = screen.getByTestId('wrapped-slide-completions')
    expect(page).toHaveClass('items-start', 'text-start')
    expect(page).not.toHaveClass('items-center', 'text-center')
    const figure = page.querySelector('[data-wrapped-figure="primary"]')
    expect(figure).toHaveStyle({ fontSize: '60px', fontWeight: '600' })
    expect(page).not.toHaveTextContent('wrapped.slides.completions.eyebrow')
  })

  it.each([
    ['en', 0, 'Your next log starts a new streak.'],
    ['en', 1, 'Your current streak is 1 day.'],
    ['en', 5, 'Your current streak is 5 days.'],
    ['pt-BR', 0, 'Seu próximo registro começa uma nova sequência.'],
    ['pt-BR', 1, 'Sua sequência atual é de 1 dia.'],
    ['pt-BR', 5, 'Sua sequência atual é de 5 dias.'],
  ])('renders the %s current streak caption at %i', (locale, count, caption) => {
    motionTestState.realLocale = locale
    renderSlide({ id: 'streak', bestStreak: 8, currentStreak: count })
    expect(screen.getByTestId('wrapped-slide-streak')).toHaveTextContent(caption)
  })

  it('puts the intro mark before the title and uses the 28px weekday and share titles', () => {
    const slides = buildWrappedSlides(recap)
    const intro = renderSlide(slides.find((slide) => slide.id === 'intro')!)
    const introParts = screen.getAllByTestId('wrapped-motion-part')
    expect(introParts[0]?.querySelector('svg')).toBeInTheDocument()
    expect(introParts[1]?.tagName).toBe('H1')
    intro.unmount()

    const weekday = renderSlide(slides.find((slide) => slide.id === 'consistency')!)
    expect(screen.getByTestId('wrapped-slide-consistency').querySelector('h2')).toHaveStyle({ fontSize: '28px' })
    expect(screen.getByRole('group', { name: 'wrapped.slides.consistency.title' }).parentElement).toHaveClass('w-full')
    weekday.unmount()

    renderSlide(slides.find((slide) => slide.id === 'share')!)
    expect(screen.getByTestId('wrapped-slide-share').querySelector('h2')).toHaveStyle({ fontSize: '28px' })
  })

  it('shows an 88px well with the habit initial when emoji is absent', () => {
    renderSlide({ id: 'topHabit', habit: { name: 'Read', emoji: null, completionRate: 50, completedCount: 5, scheduledCount: 10 } })
    const well = screen.getByTestId('wrapped-slide-topHabit').querySelector('[data-wrapped-figure="primary"]')
    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName('Read')
    expect(well).toHaveClass('size-[88px]', 'bg-[var(--bg-well)]')
    expect(well).toHaveTextContent('R')
    expect(well).not.toHaveTextContent('⭐')
    expect(screen.getByTestId('wrapped-slide-topHabit')).toHaveTextContent('wrapped.slides.topHabit.label')
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

    expect(screen.getByRole('group', { name: 'wrapped.slides.consistency.title' })).toBeInTheDocument()
    expect(screen.getAllByRole('img').map((column) => column.getAttribute('aria-label'))).toEqual(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        .map((weekday, index) => `dates.daysShort.${weekday}: ${(index + 1) * 10}`),
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
      'wrapped.slides.consistency.summary:{"strong":"dates.daysLong.friday"}',
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
