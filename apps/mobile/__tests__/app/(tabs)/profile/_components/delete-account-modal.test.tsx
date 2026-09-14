import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
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
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string) => mocks.beginChallenge(operation),
}))
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: Date) => value.toISOString() }),
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

async function renderModal() {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <DeleteAccountModal
        open
        onClose={mocks.onClose}
        profile={createMockProfile({ hasProAccess: false, plan: 'free' })}
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

  it('shows the irreversible warning without requesting deletion on mount', async () => {
    const tree = await renderModal()
    const copy = textContent(tree.root)

    expect(
      tree.root.findAll((node: { children: unknown[] }) =>
        node.children.includes('profile.deleteAccount.warning')),
    ).toHaveLength(1)
    expect(copy).toContain('profile.deleteAccount.warningFree')
    expect(copy).toContain('profile.deleteAccount.warningDetail')
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
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
