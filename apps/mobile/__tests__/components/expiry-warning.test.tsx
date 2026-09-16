import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpiryWarning } from '@/components/ui/expiry-warning'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestInstance {
  root: TestNode
  update(element: React.ReactNode): void
  unmount(): void
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const authState: { expiresAt: number | null; isAuthenticated: boolean } = {
    expiresAt: 0,
    isAuthenticated: true,
  }
  return {
    authState,
    logout: vi.fn(),
    refreshSession: vi.fn(),
    clearSessionAndResetAuth: vi.fn(),
  }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) =>
    selector(mocks.authState),
  refreshSession: mocks.refreshSession,
  clearSessionAndResetAuth: mocks.clearSessionAndResetAuth,
}))

vi.mock('@/hooks/use-logout', () => ({
  useLogout: () => mocks.logout,
}))

let tree: TestInstance | null = null

async function renderExpiredWarning(): Promise<TestInstance> {
  mocks.authState.expiresAt = Date.now() - 60_000
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<ExpiryWarning />)
  })
  return tree!
}

function hostNodes(instance: TestInstance, type: string): TestNode[] {
  return instance.root.findAll((node) => node.type === type)
}

function renderedText(instance: TestInstance): string[] {
  return hostNodes(instance, 'Text').flatMap((node) =>
    React.Children.toArray(node.props.children as React.ReactNode).filter(
      (child): child is string => typeof child === 'string',
    ),
  )
}

function action(instance: TestInstance, label: string): TestNode {
  const match = hostNodes(instance, 'Pressable').find((node) =>
    node.findAll(
      (child) => child.type === 'Text' && child.props.children === label,
    ).length > 0,
  )
  expect(match, label).toBeDefined()
  return match!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'))
  mocks.authState.isAuthenticated = true
  mocks.authState.expiresAt = null
  mocks.logout.mockReset()
  mocks.refreshSession.mockReset()
  mocks.clearSessionAndResetAuth.mockReset()
  mocks.clearSessionAndResetAuth.mockImplementation(() => {
    mocks.authState.isAuthenticated = false
    mocks.authState.expiresAt = null
  })
})

afterEach(async () => {
  if (tree) {
    await TestRenderer.act(() => tree?.unmount())
    tree = null
  }
  vi.useRealTimers()
})

describe('ExpiryWarning', () => {
  it('recovers an elapsed session without asking for credentials', async () => {
    mocks.refreshSession.mockImplementation(() => {
      mocks.authState.isAuthenticated = true
      mocks.authState.expiresAt = Date.now() + 60 * 60_000
      return { status: 'refreshed', token: 'fresh-access-token' }
    })
    const instance = await renderExpiredWarning()

    expect(renderedText(instance)).toContain('auth.sessionExpired')
    expect(renderedText(instance)).toContain('auth.refresh')
    expect(renderedText(instance)).not.toContain('auth.login')

    await TestRenderer.act(async () => {
      await (action(instance, 'auth.refresh').props.onPress as () => Promise<void>)()
    })
    await TestRenderer.act(() => instance.update(<ExpiryWarning />))

    expect(mocks.refreshSession).toHaveBeenCalledWith({ clearOnFailure: false })
    expect(mocks.authState.isAuthenticated).toBe(true)
    expect(mocks.authState.expiresAt).toBeGreaterThan(Date.now())
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(hostNodes(instance, 'View')).toHaveLength(0)
  })

  it('offers login only after the refresh is rejected', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'unauthorized' })
    const instance = await renderExpiredWarning()

    expect(renderedText(instance)).toContain('auth.refresh')
    expect(renderedText(instance)).not.toContain('auth.login')

    await TestRenderer.act(async () => {
      await (action(instance, 'auth.refresh').props.onPress as () => Promise<void>)()
    })

    expect(renderedText(instance)).toContain('auth.sessionSignedOut')
    expect(renderedText(instance)).toContain('auth.login')
    expect(renderedText(instance)).not.toContain('auth.refresh')
    expect(mocks.clearSessionAndResetAuth).toHaveBeenCalledOnce()
    expect(mocks.authState.isAuthenticated).toBe(false)
    expect(mocks.logout).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      await (action(instance, 'auth.login').props.onPress as () => Promise<void>)()
    })
    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('keeps recovery available after a network failure', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    const instance = await renderExpiredWarning()

    await TestRenderer.act(async () => {
      await (action(instance, 'auth.refresh').props.onPress as () => Promise<void>)()
    })

    expect(renderedText(instance)).toContain('auth.sessionRefreshFailed')
    expect(renderedText(instance)).toContain('auth.refresh')
    expect(renderedText(instance)).not.toContain('auth.login')
    expect(mocks.clearSessionAndResetAuth).not.toHaveBeenCalled()
    expect(mocks.authState.isAuthenticated).toBe(true)
  })

  it('shows progress while session recovery is running', async () => {
    type RefreshedOutcome = { status: 'refreshed'; token: string }
    let resolveRefresh!: (outcome: RefreshedOutcome) => void
    mocks.refreshSession.mockImplementation(
      () =>
        new Promise<RefreshedOutcome>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const instance = await renderExpiredWarning()
    let refreshPromise!: Promise<void>

    await TestRenderer.act(async () => {
      refreshPromise = (action(instance, 'auth.refresh').props.onPress as () => Promise<void>)()
      await Promise.resolve()
    })

    expect(action(instance, 'auth.refresh').props.disabled).toBe(true)
    expect(hostNodes(instance, 'ActivityIndicator')).toHaveLength(1)
    expect(renderedText(instance)).toContain('auth.refresh')

    await TestRenderer.act(async () => {
      resolveRefresh({ status: 'refreshed', token: 'fresh-access-token' })
      await refreshPromise
    })
  })
})
