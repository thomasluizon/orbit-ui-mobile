import { useAuthStore } from '@/stores/auth-store'
import { destructiveFailureCases, destructiveActionMessage } from '@orbit/shared/test-support/destructive-action-fixtures'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DeleteAccountModal } from '@/app/(tabs)/profile/_components/delete-account-modal'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { advanceAccountGeneration } from '@/lib/session-epoch'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  beginChallenge: vi.fn(),
  isOnline: { current: true },
  onClose: vi.fn(),
  push: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

const failureCopy = vi.hoisted(() => ({ actual: false, locale: 'en' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (failureCopy.actual) return destructiveActionMessage(failureCopy.locale, key)
      const warningKey = key.slice('profile.deleteAccount.'.length)
      const warning = key.startsWith('profile.deleteAccount.warning') || key === 'profile.deleteAccount.offlineDescription'
        ? Reflect.get(ptBR.profile.deleteAccount, warningKey) as unknown
        : undefined
      if (typeof warning === 'string') {
        return warning.replace(/\{(\w+)\}/g, (_, token: string) => String(params?.[token]))
      }
      return key
    },
  }),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string, accountId: string | null) =>
    mocks.beginChallenge(operation, accountId),
}))
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mocks.isOnline.current }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'default', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  mixHex: () => '#000000',
  radius: { full: 999 },
}))
vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'))

async function renderModal(
  profile = createMockProfile({ hasProAccess: false, plan: 'free' }),
) {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <DeleteAccountModal
        open
        onClose={mocks.onClose}
        profile={profile}
      />,
    )
    await Promise.resolve()
  })
  return tree
}

function textContent(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object' || !('children' in node)) return ''
  return (node as { children: unknown[] }).children.map(textContent).join('')
}

function button(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.find(
    (node: { props: { accessibilityRole?: string; accessibilityLabel?: string }; children: unknown[] }) =>
      node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel ?? textContent(node)) === label,
  )
}

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'
    vi.clearAllMocks()
    mocks.isOnline.current = true
    useAuthStore.setState({ sessionPhase: 'signed-in', isAuthenticated: true, user: { userId: 'user-1', name: 'Alex', email: 'alex@example.com' } })
    mocks.apiClient.mockResolvedValue({ message: 'sent' })
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('explains Apple cancellation while preserving the deletion window', async () => {
    const tree = await renderModal(createMockProfile({ billingProvider: 'app_store', hasProAccess: false }))
    expect(textContent(tree.root)).toContain(ptBR.profile.deleteAccount.warningAppStore)
    expect(textContent(tree.root)).toContain(ptBR.profile.deleteAccount.warningFree)
  })

  it('keeps the cancellation path in the pre-confirmation copy', async () => {
    const tree = await renderModal()
    const copy = textContent(tree.root)

    expect(copy).toMatch(/tempo para mudar de ideia/i)
    expect(copy).toContain(ptBR.profile.deleteAccount.warningFree)
    expect(copy).not.toContain(ptBR.profile.deleteAccount.warningPro)
    expect(copy).toContain(ptBR.profile.deleteAccount.warningDetail)
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
  })

  it('shows the Pro deletion upper bound without tying it to the plan ending', async () => {
    const tree = await renderModal(createMockProfile({
      hasProAccess: true,
      plan: 'pro',
      planExpiresAt: '2999-01-01T00:00:00Z',
    }))
    const copy = textContent(tree.root)

    expect(copy).toContain('em até 30 dias a partir de hoje')
    expect(copy).not.toContain('depois que o seu plano terminar')
    expect(copy).toContain(ptBR.profile.deleteAccount.warningPro)
    expect(copy).not.toContain(ptBR.profile.deleteAccount.warningFree)
  })

  it('shows the Free warning for Pro access without a plan expiry', async () => {
    const tree = await renderModal(createMockProfile({
      hasProAccess: true,
      plan: 'pro',
      planExpiresAt: null,
    }))
    const copy = textContent(tree.root)

    expect(copy).toContain(ptBR.profile.deleteAccount.warningFree)
    expect(copy).not.toContain(ptBR.profile.deleteAccount.warningPro)
  })

  it('shows the Free warning for Pro access with a past plan expiry', async () => {
    const tree = await renderModal(createMockProfile({
      hasProAccess: true,
      plan: 'pro',
      planExpiresAt: '2000-01-01T00:00:00Z',
    }))
    const copy = textContent(tree.root)

    expect(copy).toContain(ptBR.profile.deleteAccount.warningFree)
    expect(copy).not.toContain(ptBR.profile.deleteAccount.warningPro)
  })
})

describe('DeleteAccountModal code request step', () => {
  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'
    vi.clearAllMocks()
    mocks.isOnline.current = true
    useAuthStore.setState({ sessionPhase: 'signed-in', isAuthenticated: true, user: { userId: 'user-1', name: 'Alex', email: 'alex@example.com' } })
    mocks.apiClient.mockResolvedValue({ message: 'sent' })
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  async function reachTheSendStep(label = 'common.continue') {
    const tree = await renderModal()
    await TestRenderer.act(async () => { button(tree, label).props.onPress(); await Promise.resolve() })
    return tree
  }
  const pressSend = (tree: ReturnType<typeof TestRenderer.create>, label = 'profile.deleteAccount.sendCode') =>
    TestRenderer.act(async () => { button(tree, label).props.onPress(); await Promise.resolve(); await Promise.resolve() })

  it('sends one deletion request when Send code is pressed twice in the same turn', async () => {
    let reject!: (error: Error) => void
    mocks.apiClient.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
    const tree = await reachTheSendStep()
    await TestRenderer.act(async () => {
      const send = button(tree, 'profile.deleteAccount.sendCode')
      send.props.onPress(); send.props.onPress()
      await Promise.resolve()
    })
    expect(mocks.apiClient).toHaveBeenCalledOnce()
    await TestRenderer.act(() => reject(new Error('Failed')))
    TestRenderer.act(() => tree.unmount())
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-1' } })
  })

  it('does not request deletion without an account', async () => {
    useAuthStore.setState({ user: null })
    const tree = await reachTheSendStep()
    await pressSend(tree)
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['success', 'failure', 'challenge'] as const)('clears the send busy state when another account replaces the session during %s', async (outcome) => {
    let settle!: () => void
    let reject!: (error: Error) => void
    const pending = new Promise<void>((resolve, rejectRequest) => { settle = resolve; reject = rejectRequest })
    if (outcome === 'challenge') mocks.beginChallenge.mockReturnValueOnce(pending)
    else mocks.apiClient.mockReturnValueOnce(pending)
    const tree = await reachTheSendStep()
    await TestRenderer.act(async () => { button(tree, 'profile.deleteAccount.sendCode').props.onPress(); await Promise.resolve() })
    await TestRenderer.act(async () => {
      useAuthStore.setState({ user: { userId: 'user-2', name: 'Next', email: 'next@example.com' } })
      advanceAccountGeneration()
      if (outcome === 'failure') reject(new Error('Failed'))
      else settle()
      await Promise.resolve()
    })
    expect(button(tree, 'profile.deleteAccount.sendCode').props.accessibilityState.busy).not.toBe(true)
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.onClose).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-2' } })
  })

  it.each(destructiveFailureCases.flatMap(scenario => ['en', 'pt-BR'].map(locale => ({ ...scenario, locale }))))('shows $kind failure copy in $locale and keeps the session', async ({ createError, key, locale }) => {
    failureCopy.actual = true; failureCopy.locale = locale
    mocks.apiClient.mockRejectedValueOnce(createError())
    const tree = await reachTheSendStep(destructiveActionMessage(locale, 'common.continue'))
    const label = destructiveActionMessage(locale, 'profile.deleteAccount.sendCode')
    await TestRenderer.act(async () => { button(tree, label).props.onPress(); await Promise.resolve() })
    expect(textContent(tree.root)).toContain(destructiveActionMessage(locale, key ?? 'profile.deleteAccount.errorGeneric'))
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-1' } })
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.onClose).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it('starts the challenge and enters the deletion step up after one request', async () => {
    const tree = await reachTheSendStep()
    await pressSend(tree)

    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.requestDeletion, { method: 'POST' }, expect.anything())
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')
    expect(mocks.onClose).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
    expect(mocks.push).toHaveBeenCalledTimes(1)
  })

  it('keeps the first gate open and reports a safe error when sending fails', async () => {
    mocks.apiClient.mockRejectedValueOnce(new Error('private backend detail'))
    const tree = await reachTheSendStep()
    await pressSend(tree)

    expect(textContent(tree.root)).toContain('profile.deleteAccount.errorGeneric')
    expect(textContent(tree.root)).not.toContain('private backend detail')
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-1' } })
  })

  it.each(['success', 'failure'])('drops a late deletion challenge %s after replacement', async (outcome) => {
    let settle!: (value: { message: string }) => void
    let reject!: (reason: Error) => void
    mocks.apiClient.mockReturnValue(new Promise((resolve, rejectPromise) => {
      settle = resolve
      reject = rejectPromise
    }))
    const tree = await reachTheSendStep()
    await TestRenderer.act(async () => {
      button(tree, 'profile.deleteAccount.sendCode').props.onPress()
      await Promise.resolve()
    })

    useAuthStore.setState({ user: { userId: 'user-2', name: 'Next', email: 'next@example.com' } })
    TestRenderer.act(() => {
      tree.unmount()
      advanceAccountGeneration()
    })
    await TestRenderer.act(async () => {
      if (outcome === 'success') settle({ message: 'sent' })
      else reject(new Error('Account A failure'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-2' } })
  })
})
