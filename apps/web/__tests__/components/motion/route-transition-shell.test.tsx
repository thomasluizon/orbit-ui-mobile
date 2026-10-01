import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

interface TransitionMotion {
  direction: -1 | 0 | 1
  isPrimaryTabSwitch: boolean
  motionPreset: {
    enterDuration: number
    exitDuration: number
    shift: number
  }
}

type VariantResolver = (transition: TransitionMotion) => {
  opacity: number
  transition?: { duration: number }
  x: number
}

const mocks = vi.hoisted(() => ({
  childTransitions: [] as TransitionMotion[],
  initials: [] as (false | string)[],
  reducedMotion: false,
  intent: 'neutral' as 'back' | 'forward' | 'neutral',
  pathname: '/',
  transitions: [] as TransitionMotion[],
  variants: null as null | {
    animate: VariantResolver
    initial: VariantResolver
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}))

vi.mock('@/lib/motion/route-intent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/motion/route-intent')>()
  return {
    ...actual,
    resetRouteTransitionIntent: vi.fn(),
    useRouteTransitionIntent: () => ({ intent: mocks.intent, version: 0 }),
  }
})

vi.mock('motion/react', async () => {
  const ReactModule = await import('react')
  return {
    domMax: {},
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    m: {
      div: ({ children, custom, variants, initial }: {
        children: React.ReactNode
        custom: TransitionMotion
        variants: typeof mocks.variants
        initial: false | string
      }) => {
        mocks.transitions.push(custom)
        mocks.initials.push(initial)
        mocks.childTransitions.push(custom)
        mocks.variants = variants
        return ReactModule.createElement('div', null, children)
      },
    },
    useReducedMotion: () => mocks.reducedMotion,
  }
})

import { RouteTransitionShell } from '@/components/motion/route-transition-shell'

function latestTransition() {
  return mocks.transitions.at(-1)!
}

function resolvedVariants() {
  const transition = latestTransition()
  expect(mocks.childTransitions.at(-1)).toBe(transition)
  const variants = mocks.variants!
  return {
    enter: variants.initial(transition),
    entering: variants.animate(transition),
  }
}

describe('RouteTransitionShell', () => {
  beforeEach(() => {
    mocks.initials.length = 0
    mocks.reducedMotion = false
    mocks.childTransitions.length = 0
    mocks.intent = 'neutral'
    mocks.pathname = '/'
    mocks.transitions.length = 0
    mocks.variants = null
  })

  it('skips entrance animation on a direct load', () => {
    render(<RouteTransitionShell><p>Today</p></RouteTransitionShell>)
    expect(mocks.initials.at(-1)).toBe(false)
  })

  it('replaces route displacement with a fade under reduced motion', () => {
    mocks.reducedMotion = true
    const shell = render(<RouteTransitionShell><p>Today</p></RouteTransitionShell>)
    mocks.intent = 'forward'
    mocks.pathname = '/notifications'
    shell.rerender(<RouteTransitionShell><p>Alerts</p></RouteTransitionShell>)
    expect(mocks.initials.at(-1)).toBe('initial')
    expect(resolvedVariants()).toMatchObject({ enter: { opacity: 0, x: 0 }, entering: { opacity: 1, x: 0 } })
  })

  it('uses a hierarchical entrance on push from Hoje to habit detail', () => {
    const shell = render(<RouteTransitionShell><p>Hoje</p></RouteTransitionShell>)
    mocks.intent = 'forward'
    mocks.pathname = '/habits/habit-1'

    shell.rerender(<RouteTransitionShell><p>Habit</p></RouteTransitionShell>)

    expect(resolvedVariants()).toMatchObject({
      enter: { opacity: 0, x: 12 },
      entering: { transition: { duration: 0.22 } },
    })
  })

  it('uses a hierarchical entrance on back from habit detail to Hoje', () => {
    mocks.pathname = '/habits/habit-1'
    const shell = render(<RouteTransitionShell><p>Habit</p></RouteTransitionShell>)
    mocks.intent = 'back'
    mocks.pathname = '/'

    shell.rerender(<RouteTransitionShell><p>Hoje</p></RouteTransitionShell>)

    expect(resolvedVariants()).toMatchObject({
      enter: { opacity: 0, x: -12 },
      entering: { transition: { duration: 0.22 } },
    })
  })

  it('keeps a primary-tab switch instant', () => {
    const shell = render(<RouteTransitionShell><p>Hoje</p></RouteTransitionShell>)
    mocks.pathname = '/calendar'

    shell.rerender(<RouteTransitionShell><p>Calendar</p></RouteTransitionShell>)

    expect(resolvedVariants()).toMatchObject({
      enter: { opacity: 1, x: 0 },
      entering: { transition: { duration: 0 } },
    })
  })
})
