import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DeleteAccountModal } from '@/app/(tabs)/profile/_components/delete-account-modal'

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const warningKey = key.slice('profile.deleteAccount.'.length)
      const warning = key.startsWith('profile.deleteAccount.warning')
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
  beginStepUpChallenge: (operation: string) => mocks.beginChallenge(operation),
}))
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mocks.isOnline.current }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'default', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  darkenHex: () => '#000000',
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
    (node: { props: { accessibilityRole?: string }; children: unknown[] }) =>
      node.props.accessibilityRole === 'button' && textContent(node) === label,
  )
}

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isOnline.current = true
    mocks.apiClient.mockResolvedValue({ message: 'sent' })
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

  it('shows the capped Pro deletion window without the Free warning', async () => {
    const tree = await renderModal(createMockProfile({
      hasProAccess: true,
      plan: 'pro',
      planExpiresAt: '2999-01-01T00:00:00Z',
    }))
    const copy = textContent(tree.root)

    expect(copy).toContain('no máximo 30 dias a partir de hoje')
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

  it('requests the code before entering the deletion step up', async () => {
    const tree = await renderModal()

    await TestRenderer.act(async () => {
      button(tree, 'profile.deleteAccount.sendCode').props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.auth.requestDeletion,
      { method: 'POST' },
      expect.anything(),
    )
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete')
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })
})
