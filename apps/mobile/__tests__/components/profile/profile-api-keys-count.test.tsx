import React from 'react'
import { expect, it, vi } from 'vitest'
import type { Profile } from '@orbit/shared/types/profile'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

const TestRenderer = require('react-test-renderer')

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: mocks.create,
  }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => null }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => null }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

it.each([0, 1, 3])('shows the count before key step-up for %i active keys', (count) => {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <ProfileApiKeys
        profile={{ hasProAccess: true, activeApiKeyCount: count } as Profile}
        unlocked={false}
      />,
    )
  })

  const rows = tree.root.findAllByType(ListRow)
  expect(rows).toHaveLength(1)
  expect(rows[0].props.title).toBe('profile.apiKeys.open')
  expect(rows[0].props.wrapTitle).toBe(true)
  expect(rows[0].props.wrapValue).toBe(true)
  expect(rows[0].props.value).toBe(count === 0
    ? 'profile.apiKeys.noKeys'
    : `profile.apiKeys.activeCount:{"count":${count}}`)
})

it('uses small intrinsic Cancel then Create actions in the scoped-key sheet', () => {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />) })
  const scoped = tree.root.findAllByType(PillButton).find((button: { props: { children: string } }) => button.props.children === 'profile.apiKeys.createScoped')!
  TestRenderer.act(() => scoped.props.onClick())
  expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'profile.apiKeys.scopeAction'])
  expectSmallSheetActions(tree.root)
})

it('uses a small intrinsic acknowledgement for the revealed key', async () => {
  mocks.create.mockResolvedValueOnce({ id: 'key', name: 'Key', key: 'key-value' })
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />) })
  const create = tree.root.findAllByType(PillButton).find((button: { props: { children: string } }) => button.props.children === 'profile.apiKeys.create')!
  await TestRenderer.act(async () => { await create.props.onClick() })
  expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['orbitMcp.done'])
  expectSmallSheetActions(tree.root)
})
