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
  intent: 'neutral' as 'back' | 'forward' | 'neutral',
  pathname: '/',
  transitions: [] as TransitionMotion[],
  variants: null as null | {
    animate: VariantResolver
    exit: VariantResolver
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
    AnimatePresence: ({ children, custom }: { children: React.ReactNode; custom: TransitionMotion }) => {
      mocks.transitions.push(custom)
      return <>{children}</>
    },
    domMax: {},
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    m: {
      div: ({ children, custom, variants }: {
        children: React.ReactNode
        custom: TransitionMotion
        variants: typeof mocks.variants
      }) => {
        mocks.childTransitions.push(custom)
        mocks.variants = variants
        return ReactModule.createElement('div', null, children)
      },
    },
    useReducedMotion: () => false,
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
    exit: variants.exit(transition),
  }
}

describe('RouteTransitionShell', () => {
  beforeEach(() => {
    mocks.childTransitions.length = 0
    mocks.intent = 'neutral'
    mocks.pathname = '/'
    mocks.transitions.length = 0
    mocks.variants = null
  })

  it('uses one hierarchical push for both sides from Hoje to habit detail', () => {
    const shell = render(<RouteTransitionShell><p>Hoje</p></RouteTransitionShell>)
    mocks.intent = 'forward'
    mocks.pathname = '/habits/habit-1'

    shell.rerender(<RouteTransitionShell><p>Habit</p></RouteTransitionShell>)

    expect(resolvedVariants()).toMatchObject({
      enter: { opacity: 0, x: 12 },
      entering: { transition: { duration: 0.22 } },
      exit: { opacity: 0, transition: { duration: 0.165 }, x: -12 },
    })
  })

  it('uses one hierarchical pop for both sides from habit detail to Hoje', () => {
    mocks.pathname = '/habits/habit-1'
    const shell = render(<RouteTransitionShell><p>Habit</p></RouteTransitionShell>)
    mocks.intent = 'back'
    mocks.pathname = '/'

    shell.rerender(<RouteTransitionShell><p>Hoje</p></RouteTransitionShell>)

    expect(resolvedVariants()).toMatchObject({
      enter: { opacity: 0, x: -12 },
      entering: { transition: { duration: 0.22 } },
      exit: { opacity: 0, transition: { duration: 0.165 }, x: 12 },
    })
  })

  it('keeps both sides of a primary-tab switch instant', () => {
    const shell = render(<RouteTransitionShell><p>Hoje</p></RouteTransitionShell>)
    mocks.pathname = '/calendar'

    shell.rerender(<RouteTransitionShell><p>Calendar</p></RouteTransitionShell>)

    expect(resolvedVariants()).toMatchObject({
      enter: { opacity: 1, x: 0 },
      entering: { transition: { duration: 0 } },
      exit: { opacity: 1, transition: { duration: 0 }, x: 0 },
    })
  })
})
