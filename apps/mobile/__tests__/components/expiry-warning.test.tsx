import React from 'react'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppState, StyleSheet, type AppStateStatus } from 'react-native'
import { I18nextProvider } from 'react-i18next'

import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { PillButton } from '@/components/ui/pill-button'
import { i18n } from '@/lib/i18n'
import { useAuthStore } from '@/stores/auth-store'
import { createTokensV2, radius } from '@/lib/theme'
import { SMALL_PILL_VISIBLE_MIN, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { pressableStyle } from '@/__tests__/support/press-feedback'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'
import { expectInsetHairlineRing } from '@/__tests__/support/inset-hairline-ring'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

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
    epoch: number
    credentialVersion: number
  } = {
    expiresAt: 0,
    isAuthenticated: true,
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
    epoch: 1,
    credentialVersion: 1,
  }
  const authListeners = new Set<() => void>()
  const theme: { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } = {
    currentScheme: 'orange',
    currentTheme: 'dark',
  }
  return {
    theme,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
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

const motionState = vi.hoisted(() => ({ reducedMotion: false }))

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => mocks.theme }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motionState.reducedMotion }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mocks.insets }))

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
    getSessionGeneration: () => ({ epoch: mocks.authState.epoch, credentialVersion: mocks.authState.credentialVersion }),
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

async function renderSession(expiresAt: number): Promise<TestInstance> {
  mocks.setAuthState({ expiresAt })
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={i18n}>
        <AuthenticatedRoot />
      </I18nextProvider>,
    )
  })
  return tree!
}

async function renderExpiredWarning(expiresAt = Date.now() - 60_000): Promise<TestInstance> {
  mocks.refreshSession.mockResolvedValueOnce({ status: 'network-error' })
  const instance = await renderSession(expiresAt)
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(0) })
  mocks.refreshSession.mockClear()
  return instance
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
    node.props.accessibilityLabel === label || node.findAll(
      (child) => child.type === 'Text' && (child.props.label ?? child.props.accessibilityLabel ?? child.props.children) === label,
    ).length > 0,
  )
  expect(match, label).toBeDefined()
  return match!
}

function textContent(children: React.ReactNode): string {
  return React.Children.toArray(children).map((child): string => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    return React.isValidElement<{ children?: React.ReactNode }>(child)
      ? textContent(child.props.children)
      : ''
  }).join('')
}

function actionStyle(instance: TestInstance, pressed = false) {
  return pressableStyle(action(instance, i18n.t('auth.refresh')), pressed)
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'))
  mocks.currentRoute = null
  mocks.theme.currentTheme = 'dark'
  mocks.insets = { top: 0, right: 0, bottom: 0, left: 0 }
  await i18n.changeLanguage('en')
  mocks.setAuthState({
    isAuthenticated: true,
    expiresAt: null,
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
    epoch: 1,
    credentialVersion: 1,
  })
  mocks.logout.mockReset()
  mocks.logout.mockImplementation((ownership?: { epoch: number; credentialVersion: number }) => {
    if (ownership && (ownership.epoch !== mocks.authState.epoch
      || ownership.credentialVersion !== mocks.authState.credentialVersion)) return Promise.resolve()
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
  vi.restoreAllMocks()
  AppState.currentState = 'active'
  vi.useRealTimers()
})

describe('ExpiryWarning', () => {
  it.each([
    ['en', 'Your session expires in 5 minutes. Save your work.', 'Your session expires in 4 minutes. Save your work.'],
    ['pt-BR', 'Sua sessão expira em 5 minutos. Salve o que estiver fazendo.', 'Sua sessão expira em 4 minutos. Salve o que estiver fazendo.'],
  ])('keeps the complete countdown sentence in %s', async (locale, initial, next) => {
    await i18n.changeLanguage(locale)
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    const instance = await renderSession(Date.now() + 15 * 60_000)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(textContent(hostNodes(instance, 'Text')[0]!.props.children as React.ReactNode)).toBe(initial)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(textContent(hostNodes(instance, 'Text')[0]!.props.children as React.ReactNode)).toBe(next)
    expect(StyleSheet.flatten(hostNodes(instance, 'Text')[0]!.props.style)).toMatchObject({ fontVariant: ['tabular-nums'] })
    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))
  })

  it('uses the shared card radius for the notice', async () => {
    const instance = await renderExpiredWarning()
    expect(StyleSheet.flatten(hostNodes(instance, 'View')[1]!.props.style)).toMatchObject({ borderRadius: radius.xl })
  })

  it.each(['dark', 'light'] as const)('draws the notice hairline inside the edge, so the copy starts at the 12 by 8 padding of its web twin, in %s', async (mode) => {
    mocks.theme.currentTheme = mode
    const instance = await renderExpiredWarning()
    const overdue = createTokensV2('orange', mode).statusOverdue
    const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(overdue.slice(start, start + 2), 16))
    expectInsetHairlineRing(hostNodes(instance, 'View')[1]!.props.style as never, `rgba(${red}, ${green}, ${blue}, 0.28)`)
    const measured = measureProfileRow((instance as TestInstance & { toJSON: () => never }).toJSON(), 412, 1)
    const copy = measured.texts.find((text) => text.label === i18n.t('auth.sessionRefreshFailed'))!
    expect(copy.left, 'the copy starts 12 dp inside the banner, which sits 12 dp inside the screen, as its web twin').toBe(12 + 12)
  })

  it.each([
    ['a phone in portrait, under the status bar', 412, { top: 47, right: 0, bottom: 34, left: 0 }],
    ['a phone in landscape, beside the notch', 932, { top: 0, right: 47, bottom: 21, left: 47 }],
    ['a notch on one side only', 932, { top: 47, right: 0, bottom: 21, left: 44 }],
    ['a side inset narrower than the 12 dp edge', 840, { top: 24, right: 8, bottom: 0, left: 8 }],
  ] as const)('keeps the notice clear of the device insets as its web twin does, on %s', async (_device, width, insets) => {
    mocks.insets = { ...insets }
    const instance = await renderExpiredWarning()
    const measured = measureProfileRow([(instance as TestInstance & { toJSON: () => never }).toJSON()] as never, width, 1)
    const banner = measured.boxes.find((box) => box.testID === 'expiry-warning-banner')!
    expect(banner.top, 'the web notice sits calc(var(--safe-top) + 0.25rem) from the top').toBe(insets.top + 4)
    expect(banner.left, 'the web notice sits max(12px, var(--safe-left)) from the left').toBe(Math.max(12, insets.left))
    expect(width - banner.right, 'the web notice sits max(12px, var(--safe-right)) from the right').toBe(Math.max(12, insets.right))
  })

  it.each(['dark', 'light'] as const)('uses token interaction fills in %s', async (mode) => {
    mocks.theme.currentTheme = mode
    const instance = await renderExpiredWarning()
    const tokens = createTokensV2('orange', mode)
    const pills = instance.root.findAll((node) => node.type === PillButton)
    expect(pills).toHaveLength(1)
    expect(pills[0]!.props).toMatchObject({ size: 'sm', variant: 'ghost' })
    const recoveryAction = action(instance, i18n.t('auth.refresh'))
    expect(recoveryAction.props.testID).toBe('button-ghost-sm')
    expect(actionStyle(instance)).toMatchObject({
      borderRadius: radius.full,
      overflow: 'hidden',
      height: SMALL_PILL_VISIBLE_MIN,
      width: SMALL_PILL_VISIBLE_MIN,
      minHeight: SMALL_PILL_VISIBLE_MIN,
      minWidth: SMALL_PILL_VISIBLE_MIN,
      paddingHorizontal: 0,
      backgroundColor: 'transparent',
    })
    expect(Number(actionStyle(instance).height) + 2 * (recoveryAction.props.hitSlop as number | undefined ?? 0)).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
    expect(Number(actionStyle(instance).width) + 2 * (recoveryAction.props.hitSlop as number | undefined ?? 0)).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
    expect(actionStyle(instance, true)).toMatchObject({ backgroundColor: tokens.bgHover })
    await TestRenderer.act(() => { (action(instance, i18n.t('auth.refresh')).props.onHoverIn as () => void)() })
    expect(actionStyle(instance)).toMatchObject({ backgroundColor: tokens.bgHover })
    await TestRenderer.act(() => { (action(instance, i18n.t('auth.refresh')).props.onHoverOut as () => void)() })
    expect(actionStyle(instance)).toMatchObject({ backgroundColor: 'transparent' })
    await TestRenderer.act(() => { (action(instance, i18n.t('auth.refresh')).props.onFocus as () => void)() })
    expect(actionStyle(instance)).toMatchObject({ backgroundColor: 'transparent', outlineWidth: 2, outlineColor: tokens.fg1, outlineOffset: -2 })
    await TestRenderer.act(() => { (action(instance, i18n.t('auth.refresh')).props.onBlur as () => void)() })
    expect(actionStyle(instance)).toMatchObject({ backgroundColor: 'transparent' })
  })

  it('silently renews a 15-minute token throughout normal foreground use', async () => {
    mocks.refreshSession.mockImplementation(() => {
      mocks.setAuthState({ expiresAt: Date.now() + 15 * 60_000 })
      return { status: 'refreshed', token: 'fresh-access-token' }
    })
    const instance = await renderSession(Date.now() + 15 * 60_000)
    for (let minute = 1; minute <= 31; minute += 1) {
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(hostNodes(instance, 'View'), `minute ${minute}`).toHaveLength(0)
    }
    expect(mocks.refreshSession).toHaveBeenCalledTimes(3)
    expect(mocks.authState.isAuthenticated).toBe(true)
    expect(mocks.logout).not.toHaveBeenCalled()
  })

  it('shows a warning only after automatic refresh fails and retries without signing out', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    const instance = await renderSession(Date.now() + 15 * 60_000)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000 - 1) })
    expect(hostNodes(instance, 'View')).toHaveLength(0)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))
    expect(mocks.authState.isAuthenticated).toBe(true)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(29_999) })
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    mocks.refreshSession.mockImplementation(() => {
      mocks.setAuthState({ expiresAt: Date.now() + 15 * 60_000 })
      return { status: 'refreshed', token: 'fresh-access-token' }
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.refreshSession).toHaveBeenCalledTimes(2)
    expect(hostNodes(instance, 'View')).toHaveLength(0)
    expect(mocks.logout).not.toHaveBeenCalled()
  })

  it('keeps an expired session signed in across repeated automatic failures', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    const instance = await renderSession(Date.now() + 15 * 60_000)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(16 * 60_000) })
    expect(mocks.refreshSession.mock.calls.length).toBeGreaterThan(1)
    expect(renderedText(instance)).toContain(i18n.t('auth.sessionRefreshFailed'))
    expect(mocks.authState.isAuthenticated).toBe(true)
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(mocks.currentRoute).toBeNull()
  })

  it('routes to sign-in when automatic refresh is rejected', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'unauthorized' })
    await renderSession(Date.now() + 15 * 60_000)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(mocks.currentRoute).toBe('/login')
    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('refreshes on foreground return and removes its timer and listener on unmount', async () => {
    let onChange!: (state: AppStateStatus) => void
    const remove = vi.fn()
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onChange = listener
      return { remove }
    })
    AppState.currentState = 'background'
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    await renderSession(Date.now() + 15 * 60_000)
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(12 * 60_000) })
    expect(mocks.refreshSession).not.toHaveBeenCalled()
    AppState.currentState = 'active'
    await TestRenderer.act(() => { onChange('active') })
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    await TestRenderer.act(() => { tree?.unmount() })
    tree = null
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('refreshes a valid token inside the warning window without signing out', async () => {
    mocks.refreshSession.mockImplementation(() => {
      mocks.setAuthState({ expiresAt: Date.now() + 15 * 60_000 })
      return { status: 'refreshed', token: 'fresh-access-token' }
    })
    const instance = await renderExpiredWarning(Date.now() + 4 * 60_000)

    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))
    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(mocks.authState.isAuthenticated).toBe(true)
    expect(mocks.currentRoute).toBeNull()
    expect(hostNodes(instance, 'View')).toHaveLength(0)
  })

  it('recovers an elapsed session without asking for credentials', async () => {
    mocks.refreshSession.mockImplementation(() => {
      mocks.setAuthState({
        isAuthenticated: true,
        expiresAt: Date.now() + 60 * 60_000,
      })
      return { status: 'refreshed', token: 'fresh-access-token' }
    })
    const instance = await renderExpiredWarning()

    expect(renderedText(instance)).toContain(i18n.t('auth.sessionRefreshFailed'))
    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))
    expect(renderedText(instance)).not.toContain(i18n.t('auth.login'))

    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(mocks.refreshSession).toHaveBeenCalledWith()
    expect(mocks.authState.isAuthenticated).toBe(true)
    expect(mocks.authState.expiresAt).toBeGreaterThan(Date.now())
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(hostNodes(instance, 'View')).toHaveLength(0)
  })

  it('offers login only after the refresh is rejected', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'unauthorized' })
    const instance = await renderExpiredWarning()

    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))
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

  it.each([false, true])('keeps the message and its action, and shows Orbit in Parado only with the guided flows on (%s)', async (guided) => {
    if (guided) enableTestFlags('orbit_guided_flows')
    const instance = await renderExpiredWarning()
    expect(renderedText(instance)).toContain(i18n.t('auth.sessionRefreshFailed'))
    expect(action(instance, i18n.t('auth.refresh'))).toBeDefined()
    const rigs = instance.root.findAll((node) => typeof node.type === 'string' && node.props['data-orbit-face'] === 'rig')
    expect(rigs.map((node) => node.props['data-orbit-state'] as string)).toEqual(guided ? ['parado'] : [])
  })

  it.each([[false, 'running'], [true, 'still']] as const)('draws Orbit with reduced motion %s as %s, with the guided flows on', async (reducedMotion, loop) => {
    enableTestFlags('orbit_guided_flows')
    motionState.reducedMotion = reducedMotion
    reanimatedTestState.reducedMotion = reducedMotion
    try {
      const instance = await renderExpiredWarning()
      const rigs = instance.root.findAll((node) => typeof node.type === 'string' && node.props['data-orbit-face'] === 'rig')
      expect(rigs.map((node) => node.props['data-orbit-loop'] as string)).toEqual([loop])
    } finally {
      motionState.reducedMotion = false
      reanimatedTestState.reducedMotion = false
    }
  })

  it('keeps recovery available when a server failure is retryable', async () => {
    mocks.refreshSession.mockResolvedValue({ status: 'network-error' })
    const instance = await renderExpiredWarning()

    await TestRenderer.act(async () => {
      await (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
    })

    expect(renderedText(instance)).toContain(i18n.t('auth.sessionRefreshFailed'))
    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))
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
    expect(mocks.authState.isAuthenticated).toBe(true)
  })

  it('does not log out a replacement after an old refresh returns unauthorized', async () => {
    let resolveRefresh!: (outcome: { status: 'unauthorized' }) => void
    mocks.refreshSession.mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve }))
    const instance = await renderExpiredWarning()
    let recovery!: Promise<void>

    await TestRenderer.act(async () => {
      recovery = (action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>)()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      resolveRefresh({ status: 'unauthorized' })
      mocks.setAuthState({
        epoch: 2,
        credentialVersion: 2,
        isAuthenticated: true,
        expiresAt: Date.now() + 60 * 60_000,
        accessToken: 'replacement-access-token',
        refreshToken: 'replacement-refresh-token',
      })
      await recovery
    })

    expect(mocks.logout).not.toHaveBeenCalled()
    expect(mocks.currentRoute).toBeNull()
    expect(mocks.authState.accessToken).toBe('replacement-access-token')
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

  it('shows the skeleton face on its action while session recovery is running', async () => {
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
    const press = action(instance, i18n.t('auth.refresh')).props.onPress as () => Promise<void>

    await TestRenderer.act(async () => {
      refreshPromise = press()
      await Promise.resolve()
    })

    expect(action(instance, i18n.t('auth.refresh')).props.disabled).toBe(true)
    expect(hostNodes(instance, 'ActivityIndicator')).toHaveLength(0)
    expect(instance.root.findAll((node) => node.type === 'View' && node.props.testID === 'skeleton-face')).toHaveLength(1)
    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityLabel).toBe(i18n.t('auth.refresh'))

    await TestRenderer.act(async () => {
      await press()
    })
    expect(action(instance, i18n.t('auth.refresh')).props.onPress).toBeUndefined()
    expect(mocks.refreshSession).toHaveBeenCalledOnce()
    expect(action(instance, i18n.t('auth.refresh')).props.accessibilityState).toEqual({ busy: true, disabled: true })
    expect(actionStyle(instance, true)).toMatchObject({ backgroundColor: 'transparent' })

    await TestRenderer.act(async () => {
      resolveRefresh({ status: 'refreshed', token: 'fresh-access-token' })
      await refreshPromise
    })
  })
})
