import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { i18n } from '@/lib/i18n'
import { useAuthStore } from '@/stores/auth-store'

vi.unmock('react-i18next')

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
  const authState: {
    expiresAt: number | null
    isAuthenticated: boolean
    accessToken: string | null
    refreshToken: string | null
  } = {
    expiresAt: 0,
    isAuthenticated: true,
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
  }
  const authListeners = new Set<() => void>()
  return {
    authState,
    authListeners,
    currentRoute: null as string | null,
    logout: vi.fn(),
    refreshSession: vi.fn(),
    clearSessionAndResetAuth: vi.fn(),
    setAuthState: (nextState: Partial<typeof authState>) => {
      Object.assign(authState, nextState)
      authListeners.forEach((listener) => listener())
    },
  }
})

vi.mock('@/stores/auth-store', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useAuthStore: (selector: (state: typeof mocks.authState) => unknown) =>
      useSyncExternalStore(
        (listener) => {
          mocks.authListeners.add(listener)
          return () => mocks.authListeners.delete(listener)
        },
        () => selector(mocks.authState),
        () => selector(mocks.authState),
      ),
    refreshSession: mocks.refreshSession,
    clearSessionAndResetAuth: mocks.clearSessionAndResetAuth,
  }
})

vi.mock('@/hooks/use-logout', () => ({
  useLogout: () => mocks.logout,
}))

let tree: TestInstance | null = null

function AuthenticatedRoot() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <ExpiryWarning /> : null
}

async function renderExpiredWarning(): Promise<TestInstance> {
  mocks.setAuthState({ expiresAt: Date.now() - 60_000 })
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={i18n}>
        <AuthenticatedRoot />
      </I18nextProvider>,
    )
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
  mocks.currentRoute = null
  mocks.setAuthState({
    isAuthenticated: true,
    expiresAt: null,
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
  })
  mocks.logout.mockReset()
  mocks.logout.mockImplementation(() => {
    mocks.currentRoute = '/login'
    mocks.setAuthState({
      isAuthenticated: false,
      expiresAt: null,
      accessToken: null,
      refreshToken: null,
    })
    return Promise.resolve()
  })
  mocks.refreshSession.mockReset()
  mocks.clearSessionAndResetAuth.mockReset()
  mocks.clearSessionAndResetAuth.mockImplementation(() => {
    mocks.setAuthState({ isAuthenticated: false, expiresAt: null })
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
      mocks.setAuthState({
        isAuthenticated: true,
        expiresAt: Date.now() + 60 * 60_000,
      })
      return { status: 'refreshed', token: 'fresh-access-token' }
    })
    const instance = await renderExpiredWarning()

    expect(renderedText(instance)).toContain(i18n.t('auth.sessionExpired'))
    expect(renderedText(instance)).toContain(i18n.t('auth.refresh'))
    expect(renderedText(instance)).not.toContain(i18n.t('auth.login'))

    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(mocks.refreshSession).toHaveBeenCalledWith({ clearOnFailure: false })
    expect(mocks.authState.isAuthenticated).toBe(true)
    expect(mocks.authState.expiresAt).toBeGreaterThan(Date.now())
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(hostNodes(instance, 'View')).toHaveLength(0)
  })

  it('offers login only after the refresh is rejected', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'unauthorized' })
    const instance = await renderExpiredWarning()

    expect(renderedText(instance)).toContain(i18n.t('auth.refresh'))
    expect(renderedText(instance)).not.toContain(i18n.t('auth.login'))

    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(mocks.currentRoute).toBe('/login')
    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.clearSessionAndResetAuth).not.toHaveBeenCalled()
    expect(mocks.authState.isAuthenticated).toBe(false)
    expect(hostNodes(instance, 'View')).toHaveLength(0)
  })

  it('keeps recovery available when a server failure is retryable', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    const instance = await renderExpiredWarning()

    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(renderedText(instance)).toContain(i18n.t('auth.sessionRefreshFailed'))
    expect(renderedText(instance)).toContain(i18n.t('auth.refresh'))
    expect(renderedText(instance)).not.toContain(i18n.t('auth.login'))
    expect(mocks.clearSessionAndResetAuth).not.toHaveBeenCalled()
    expect(mocks.authState.isAuthenticated).toBe(true)
  })

  it('keeps recovery available when refresh rejects', async () => {
    mocks.refreshSession.mockRejectedValue(new Error('SecureStore unavailable'))
    const instance = await renderExpiredWarning()

    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(renderedText(instance)).toContain(i18n.t('auth.sessionRefreshFailed'))
    expect(action(instance, i18n.t('auth.refresh')).props.disabled).toBe(false)
    expect(renderedText(instance)).not.toContain(i18n.t('auth.login'))
    expect(mocks.authState.isAuthenticated).toBe(true)
  })

  it('does not log out a replacement session after refresh is superseded', async () => {
    type SupersededOutcome = { status: 'superseded' }
    let resolveRefresh!: (outcome: SupersededOutcome) => void
    mocks.refreshSession.mockImplementation(
      () => new Promise<SupersededOutcome>((resolve) => { resolveRefresh = resolve }),
    )
    const instance = await renderExpiredWarning()
    let refreshPromise!: Promise<void>

    await TestRenderer.act(async () => {
      refreshPromise = (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.setAuthState({
        isAuthenticated: false,
        expiresAt: null,
        accessToken: null,
        refreshToken: null,
      })
      mocks.setAuthState({
        isAuthenticated: true,
        expiresAt: Date.now() + 60 * 60_000,
        accessToken: 'replacement-access-token',
        refreshToken: 'replacement-refresh-token',
      })
      resolveRefresh({ status: 'superseded' })
      await refreshPromise
    })

    expect(mocks.logout).not.toHaveBeenCalled()
    expect(mocks.currentRoute).toBeNull()
    expect(mocks.authState).toMatchObject({
      isAuthenticated: true,
      accessToken: 'replacement-access-token',
      refreshToken: 'replacement-refresh-token',
    })
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
      refreshPromise = (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
      await Promise.resolve()
    })

    expect(action(instance, i18n.t('auth.refresh')).props.disabled).toBe(true)
    expect(hostNodes(instance, 'ActivityIndicator')).toHaveLength(1)
    expect(renderedText(instance)).toContain(i18n.t('auth.refresh'))

    await TestRenderer.act(async () => {
      resolveRefresh({ status: 'refreshed', token: 'fresh-access-token' })
      await refreshPromise
    })
  })
})
