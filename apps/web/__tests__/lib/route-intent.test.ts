import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ captureRouterTransitionStart: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureRouterTransitionStart: sentry.captureRouterTransitionStart,
  startInactiveSpan: vi.fn(() => ({ setAttribute: vi.fn(), end: vi.fn() })),
}))

import { onRouterTransitionStart } from '@/instrumentation-client'
import { clearAppNavigationHistory, updateAppNavigationHistory } from '@/lib/app-navigation-history'
import {
  getCurrentRouteTransitionIntent,
  getRouteDirectionForIntent,
  getRouteScenarioForIntent,
  resetRouteTransitionIntent,
  setRouteTransitionIntent,
} from '@/lib/motion/route-intent'

describe('route intent helpers', () => {
  it('maps intents to the correct shared motion scenarios', () => {
    expect(getRouteScenarioForIntent('replace')).toBe('route-replace')
    expect(getRouteScenarioForIntent('forward')).toBe('route-push')
  })

  it('maps directions consistently for push and back navigation', () => {
    expect(getRouteDirectionForIntent('forward')).toBe(1)
    expect(getRouteDirectionForIntent('back')).toBe(-1)
    expect(getRouteDirectionForIntent('instant')).toBe(0)
  })

  it('resets the live snapshot back to neutral', () => {
    setRouteTransitionIntent('forward')
    expect(getCurrentRouteTransitionIntent()).toBe('forward')

    resetRouteTransitionIntent()

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })
})

describe('route intent lifetime', () => {
  function showPage(entry: string) {
    window.history.replaceState(null, '', entry)
    updateAppNavigationHistory(entry, 'init')
  }

  function traverseTo(entry: string) {
    window.history.replaceState(null, '', entry)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function endTask() {
    vi.runOnlyPendingTimers()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    showPage('/')
  })

  afterEach(() => {
    endTask()
    resetRouteTransitionIntent()
    clearAppNavigationHistory()
    vi.useRealTimers()
  })

  it('keeps the intent of a navigation to another pathname', () => {
    setRouteTransitionIntent('forward')
    onRouterTransitionStart('/notifications', 'push')
    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('forward')
    expect(sentry.captureRouterTransitionStart).toHaveBeenLastCalledWith('/notifications', 'push')
  })

  it('clears an intent when no navigation starts in its task', () => {
    setRouteTransitionIntent('forward')
    expect(getCurrentRouteTransitionIntent()).toBe('forward')

    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })

  it.each([
    ['/calendar', '/calendar?import=1', 'push'],
    ['/', '/', 'push'],
    ['/?date=2026-11-17', '/', 'replace'],
  ] as const)('clears an intent when the navigation from %s to %s stays on the pathname', (from, to, navigationType) => {
    showPage(from)
    setRouteTransitionIntent('instant')
    onRouterTransitionStart(to, navigationType)
    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })

  it('marks a browser history traversal to another pathname as a back navigation', () => {
    showPage('/calendar')

    traverseTo('/')
    onRouterTransitionStart(window.location.href, 'traverse')
    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('back')
  })

  it('clears the back intent of a traversal between two dates of Today', () => {
    showPage('/?date=2026-11-17')

    traverseTo('/?date=2026-11-16')
    onRouterTransitionStart(window.location.href, 'traverse')
    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })

  it('clears the back intent of a history entry that the router does not restore', () => {
    traverseTo('/#section')
    expect(getCurrentRouteTransitionIntent()).toBe('back')

    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })

  it('gives no intent to a later navigation that wrote none', () => {
    setRouteTransitionIntent('replace')
    onRouterTransitionStart('/login', 'push')
    endTask()
    expect(getCurrentRouteTransitionIntent()).toBe('replace')

    onRouterTransitionStart('/notifications', 'push')

    expect(getCurrentRouteTransitionIntent()).toBe('neutral')
  })

  it('keeps the intent of the first navigation when a second one starts in the same task', () => {
    showPage('/habits/new')
    setRouteTransitionIntent('instant')
    onRouterTransitionStart('/calendar', 'push')
    onRouterTransitionStart(window.location.href, 'traverse')
    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('instant')
  })

  it('gives a later intent in the same task to the navigation that follows it', () => {
    traverseTo('/')
    onRouterTransitionStart(window.location.href, 'traverse')
    setRouteTransitionIntent('instant')
    onRouterTransitionStart('/calendar', 'push')
    endTask()

    expect(getCurrentRouteTransitionIntent()).toBe('instant')
  })
})
