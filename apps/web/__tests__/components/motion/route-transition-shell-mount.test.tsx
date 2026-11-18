import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { useRouter } from 'next/navigation'

const navigation = vi.hoisted(() => ({ pathname: '/login' }))

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))
vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  startInactiveSpan: vi.fn(() => ({ setAttribute: vi.fn(), end: vi.fn() })),
}))
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: vi.fn(async () => null) }))

import { onRouterTransitionStart } from '@/instrumentation-client'
import { handleVerifySuccess } from '@/app/(auth)/login/login-form-helpers'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { getCurrentRouteTransitionIntent, resetRouteTransitionIntent, setRouteTransitionIntent } from '@/lib/motion/route-intent'

beforeEach(() => {
  vi.useFakeTimers()
  navigation.pathname = '/login'
  window.history.replaceState(null, '', '/login')
  resetRouteTransitionIntent()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  resetRouteTransitionIntent()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

it('clears the replace intent of a login after the app shell mounts', async () => {
  const router = { push: (href: string) => onRouterTransitionStart(href, 'push') } as ReturnType<typeof useRouter>

  await handleVerifySuccess({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' }, undefined, vi.fn(), router, () => '/')
  vi.runOnlyPendingTimers()
  expect(getCurrentRouteTransitionIntent()).toBe('replace')

  navigation.pathname = '/'
  window.history.replaceState(null, '', '/')
  render(<RouteTransitionShell><p>Today</p></RouteTransitionShell>)
  act(() => { vi.runOnlyPendingTimers() })

  expect(getCurrentRouteTransitionIntent()).toBe('neutral')
})

it('keeps the intent of a navigation that starts before the mount timer runs', () => {
  navigation.pathname = '/'
  window.history.replaceState(null, '', '/')
  render(<RouteTransitionShell><p>Today</p></RouteTransitionShell>)

  act(() => {
    setRouteTransitionIntent('forward')
    onRouterTransitionStart('/notifications', 'push')
  })
  act(() => { vi.runOnlyPendingTimers() })

  expect(getCurrentRouteTransitionIntent()).toBe('forward')
})
