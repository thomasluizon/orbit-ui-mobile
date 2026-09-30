import React from 'react'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { StyleSheet } from 'react-native'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { WrappedSlide } from '@/components/wrapped/wrapped-slide'
import { OrbitMark } from '@/components/ui/orbit-mark'
import {
  reanimatedTestState,
  withDelayCalls,
  withTimingCalls,
} from '@/test-mocks/react-native-reanimated'

const translationState = vi.hoisted(() => ({ realLocale: '' }))
const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({ resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, lng: 'en', fallbackLng: 'en', initAsync: false })

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => translationState.realLocale
      ? testI18n.getFixedT(translationState.realLocale)(key, params)
      : params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: translationState.realLocale || 'en' },
  }),
}))

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
    translationState.realLocale = ''
    withDelayCalls.length = 0
    withTimingCalls.length = 0
  })

  it.each([412, 1024])('renders the drawn intro title size at %ipx', (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    const tree = renderSlide(buildWrappedSlides(recap).find((slide) => slide.id === 'intro')!)
    const title = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-figure')[0]!
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: width >= 1024 ? 44 : 34 })
  })

  it('uses the leading edge and 60px figure for completions without a page eyebrow', () => {
    const completions = buildWrappedSlides(recap).find((slide) => slide.id === 'completions')!
    const tree = renderSlide(completions)
    const page = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-slide-completions')[0]!
    const figure = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-figure')[0]!
    expect(StyleSheet.flatten(page.props.style)).toMatchObject({ alignItems: 'flex-start', paddingHorizontal: 16 })
    expect(StyleSheet.flatten(figure.props.style)).toMatchObject({ fontSize: 60 })
    expect(StyleSheet.flatten(figure.props.style)).not.toHaveProperty('textAlign', 'center')
    expect(tree.root.findAll((node) => node.props.children === 'wrapped.slides.completions.eyebrow')).toHaveLength(0)
  })

  it.each([
    ['en', 0, 'Your next log starts a new streak.'],
    ['en', 1, 'Your current streak is 1 day.'],
    ['en', 5, 'Your current streak is 5 days.'],
    ['pt-BR', 0, 'Seu próximo registro começa uma nova sequência.'],
    ['pt-BR', 1, 'Sua sequência atual é de 1 dia.'],
    ['pt-BR', 5, 'Sua sequência atual é de 5 dias.'],
  ])('renders the %s current streak caption at %i', (locale, count, caption) => {
    translationState.realLocale = locale
    const tree = renderSlide({ id: 'streak', bestStreak: 8, currentStreak: count })
    expect(tree.root.findAll((node) => node.props.children === caption).length).toBeGreaterThan(0)
  })

  it('puts the intro mark before its title and uses the 28px weekday and share titles', () => {
    const slides = buildWrappedSlides(recap)
    const intro = renderSlide(slides.find((slide) => slide.id === 'intro')!)
    const introParts = intro.root.findAll((node) => typeof node.type === 'string' && String(node.props.nativeID).startsWith('wrapped-motion-part-'))
    expect(introParts[0]?.props.nativeID).toBe('wrapped-motion-part-0')
    expect((introParts[0]?.props.children as React.ReactElement).type).toBe(OrbitMark)
    expect(introParts[1]?.props.children).toBe('wrapped.slides.intro.week')
    expect(introParts[1]?.props.accessibilityRole).toBe('header')
    const weekday = renderSlide(slides.find((slide) => slide.id === 'consistency')!)
    const weekdayTitle = weekday.root.findAll((node) => node.props.children === 'wrapped.slides.consistency.title' && typeof node.type === 'string')[0]!
    expect(StyleSheet.flatten(weekdayTitle.props.style)).toMatchObject({ fontSize: 28 })
    expect(weekdayTitle.props.accessibilityRole).toBe('header')
    const share = renderSlide(slides.find((slide) => slide.id === 'share')!)
    const shareTitle = share.root.findAll((node) => node.props.children === 'wrapped.slides.share.title' && typeof node.type === 'string')[0]!
    expect(StyleSheet.flatten(shareTitle.props.style)).toMatchObject({ fontSize: 28 })
    expect(shareTitle.props.accessibilityRole).toBe('header')
  })

  it('shows an 88px well with the habit initial when emoji is absent', () => {
    const tree = renderSlide({ id: 'topHabit', habit: { name: 'Read', emoji: null, completionRate: 50, completedCount: 5, scheduledCount: 10 } })
    const well = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-figure')[0]!
    expect(StyleSheet.flatten(well.props.style)).toMatchObject({ width: 88, height: 88 })
    expect(tree.root.findAll((node) => node.props.children === 'R').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === '⭐')).toHaveLength(0)
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

  it('keeps the top habit emoji visible but out of the accessibility announcement', () => {
    const topHabit = buildWrappedSlides(recap).find((slide) => slide.id === 'topHabit')!
    const tree = renderSlide(topHabit)
    const parts = tree.root.findAll((node) =>
      typeof node.type === 'string' && String(node.props.nativeID).startsWith('wrapped-motion-part-'))

    expect(parts.map((part) => part.props.nativeID)).toEqual([
      'wrapped-motion-part-0', 'wrapped-motion-part-1', 'wrapped-motion-part-2', 'wrapped-motion-part-3',
    ])
    expect(parts.slice(1).map((part) => part.props.children)).toEqual([
      topHabit.habit.name,
      'wrapped.slides.topHabit.label',
      'wrapped.slides.topHabit.caption:{"rate":"95%"}',
    ])
    expect(parts[0]!.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(parts[0]!.props.accessibilityElementsHidden).toBe(true)
    expect(parts[1]!.props.accessibilityRole).toBe('header')
    expect(tree.root.findAll((node) => node.props.children === topHabit.habit.emoji).length).toBeGreaterThan(0)
    expect(parts.filter((part) => part.props.importantForAccessibility !== 'no-hide-descendants')
      .map((part) => part.props.children)).toEqual([
      topHabit.habit.name,
      'wrapped.slides.topHabit.label',
      'wrapped.slides.topHabit.caption:{"rate":"95%"}',
    ])
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
