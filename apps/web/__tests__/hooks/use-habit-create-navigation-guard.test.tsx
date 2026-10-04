import { patchNextAppRouterHistory } from '@/__tests__/support/next-app-router-history'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeHabitCreateNavigation,
  useHabitCreateNavigationGuard,
} from '@/hooks/use-habit-create-navigation-guard'

let nextHistory: ReturnType<typeof patchNextAppRouterHistory>

beforeEach(() => { nextHistory = patchNextAppRouterHistory() })
afterEach(() => nextHistory.restore())

function mountGuard() {
  return renderHook(() => useHabitCreateNavigationGuard({
    active: true,
    dirty: true,
    leaving: false,
    onNavigate: vi.fn(),
    onReturn: vi.fn(),
  }))
}

async function backTo(pathname: string) {
  act(() => history.back())
  await waitFor(() => expect(location.pathname).toBe(pathname))
}

async function forwardTo(pathname: string) {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true })
      history.forward()
    })
  })
  expect(location.pathname).toBe(pathname)
}

describe('habit creation history exits', () => {
  it('returns a copied link from the initial browser entry without a phantom Forward route', async () => {
    expect(history.length).toBe(1)
    history.replaceState(null, '', '/habits/new?from=/search')
    const guard = mountGuard()
    const destination = vi.fn()
    act(() => completeHabitCreateNavigation(destination))
    await waitFor(() => expect(destination).toHaveBeenCalledOnce())
    guard.unmount()
    history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['search', {}], renderedSearch: '' } }, '', '/search')
    await waitFor(() => expect(nextHistory.writes.replaceState).toHaveBeenCalledWith(expect.objectContaining({ __NA: true }), '', '/search'))
    await forwardTo('/search')
  })

  it.each(['direct', 'navigated'])('keeps the approved %s exit traversal out of the router restore listener', async (entry) => {
    if (entry === 'navigated') {
      history.pushState(null, '', '/')
      history.pushState(null, '', '/habits/new?from=%2F')
    } else history.replaceState(null, '', '/habits/new?from=%2F')
    const traversalStates: unknown[] = []
    const recordTraversal = () => traversalStates.push(history.state)
    window.addEventListener('popstate', recordTraversal, true)
    const routerRestores: unknown[] = []
    const restoreRoute = () => routerRestores.push(history.state)
    window.addEventListener('popstate', restoreRoute)
    const guard = mountGuard()
    try {
      expect(history.state).toMatchObject({ orbitHabitCreateGuard: '/habits/new?from=%2F', orbitHabitCreateSentinel: true })
      act(() => completeHabitCreateNavigation(() => history.replaceState(null, '', '/')))
      await waitFor(() => expect(location.pathname).toBe('/'))
      expect(routerRestores).toEqual([])
      expect(traversalStates).toMatchObject([
        { orbitHabitCreateGuard: '/habits/new?from=%2F', orbitHabitCreateSentinel: false },
        { orbitHabitCreateGuard: '/habits/new?from=%2F', orbitHabitCreateSentinel: false },
      ])
      expect(history.state).toMatchObject({ __NA: true })
    } finally {
      guard.unmount()
      window.removeEventListener('popstate', recordTraversal, true)
      window.removeEventListener('popstate', restoreRoute)
    }
  })

  it('keeps the origin behind an approved pushed destination', async () => {
    history.pushState(null, '', '/search')
    history.pushState(null, '', '/habits/new?from=/search')
    const guard = mountGuard()
    act(() => completeHabitCreateNavigation(() => history.pushState(null, '', '/calendar')))
    await waitFor(() => expect(location.pathname).toBe('/calendar'))
    guard.unmount()
    await backTo('/search')
    await forwardTo('/calendar')
    await forwardTo('/calendar')
  })

  it.each(['pushState', 'replaceState'] as const)('replaces the discarded entry when Next %s commits after the create screen unmounts', async (method) => {
    history.pushState(null, '', '/search')
    history.pushState(null, '', '/habits/new?from=/search')
    const guard = mountGuard()
    const destination = vi.fn()
    act(() => completeHabitCreateNavigation(destination))
    await waitFor(() => expect(destination).toHaveBeenCalledOnce())
    history.replaceState(history.state, '', location.href)
    nextHistory.writes.pushState.mockClear()
    nextHistory.writes.replaceState.mockClear()
    const routerRestore = vi.fn()
    window.addEventListener('popstate', routerRestore)
    guard.unmount()
    history[method]({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['calendar', {}], renderedSearch: '' } }, '', '/calendar')
    await waitFor(() => expect(nextHistory.writes.replaceState).toHaveBeenCalledWith(expect.objectContaining({ __NA: true }), '', '/calendar'))
    expect(nextHistory.writes.pushState).toHaveBeenCalledWith(expect.objectContaining({ __NA: true }), '', '/calendar')
    expect(routerRestore).not.toHaveBeenCalled()
    window.removeEventListener('popstate', routerRestore)
    await backTo('/search')
    history.pushState(null, '', '/progress')
    await backTo('/search')
  })

  it.each([1, 3])('reuses its sentinel after %s reload-like remounts before returning', async (remounts) => {
    history.pushState(null, '', '/search')
    history.pushState(null, '', '/habits/new?from=/search')
    let guard = mountGuard()
    const guardedLength = history.length
    for (let index = 0; index < remounts; index += 1) {
      guard.unmount()
      vi.resetModules()
      const reloaded = await import('@/hooks/use-habit-create-navigation-guard')
      guard = renderHook(() => reloaded.useHabitCreateNavigationGuard({
        active: true, dirty: true, leaving: false, onNavigate: vi.fn(), onReturn: vi.fn(),
      }))
      if (index === remounts - 1) {
        act(() => reloaded.completeHabitCreateNavigation(() => history.replaceState(null, '', '/search')))
      }
    }
    await waitFor(() => expect(location.pathname).toBe('/search'))
    guard.unmount()
    expect(history.length).toBe(guardedLength)
    await backTo('/search')
  })

  it('truncates the abandoned fragment branch after fragment Back and remount', async () => {
    history.pushState(null, '', '/search')
    history.pushState(null, '', '/habits/new?from=/search')
    let guard = mountGuard()
    const guardedLength = history.length
    location.hash = '#one'
    await waitFor(() => expect(location.hash).toBe('#one'))
    location.hash = '#two'
    await waitFor(() => expect(location.hash).toBe('#two'))
    await act(async () => await new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true })
      history.back()
    }))
    expect(location.hash).toBe('#one')
    guard.unmount()
    guard = mountGuard()
    act(() => completeHabitCreateNavigation(() => history.pushState(null, '', '/calendar')))
    await waitFor(() => expect(location.pathname).toBe('/calendar'))
    guard.unmount()
    expect(history.length).toBe(guardedLength)
    await backTo('/search')
    await forwardTo('/calendar')
    await forwardTo('/calendar')
  })

  it.each(['/habits/new', '/habits/new?from=/search'])('keeps a directly opened copied link usable: %s', async (href) => {
    history.pushState(null, '', '/profile')
    history.pushState(null, '', href)
    const guard = mountGuard()
    act(() => completeHabitCreateNavigation(() => history.pushState(null, '', '/calendar')))
    await waitFor(() => expect(location.pathname).toBe('/calendar'))
    guard.unmount()
    await backTo('/profile')
  })
})
