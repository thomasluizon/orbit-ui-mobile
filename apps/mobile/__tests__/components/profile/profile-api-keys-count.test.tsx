import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Pressable, StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import type { Profile } from '@orbit/shared/types/profile'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const mocks = vi.hoisted(() => ({ create: vi.fn(), canCreate: true, grantAvailable: true, error: null as string | null }))

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/icons', () => ({ Key: () => null, Lock: () => null, ChevronDown: () => null, ChevronRight: () => null, Shield: () => null }))
vi.mock('@/components/ui/icon', () => ({ Icon: () => null }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: mocks.canCreate,
    createGrantAvailable: mocks.grantAvailable,
    createKeyError: mocks.error,
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

it.each([0, 1, 3])('uses the meta role for %i active keys', (count) => {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true, activeApiKeyCount: count } as Profile} unlocked={false} />)
  })
  const row = tree.root.findByType(ListRow)
  const value = row.findAllByType(Text).find((node: { props: { children: string } }) => node.props.children === row.props.value)!
  expect(StyleSheet.flatten(value.props.style)).toMatchObject({
    fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, fontVariant: ['tabular-nums'],
  })
  expect(value.props.numberOfLines).toBeUndefined()
  TestRenderer.act(() => tree.unmount())
})

it('keeps key metadata legible on the pressed card surface', () => {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true, activeApiKeyCount: 0 } as Profile} unlocked={false} />) })
  const row = tree.root.findByType(ListRow)
  const value = () => row.findAllByType(Text).find((node: { props: { children: string } }) => node.props.children === row.props.value)!
  const tokens = createTokensV2('purple', 'dark')
  expect(StyleSheet.flatten(value().props.style).color).toBe(tokens.fg3)
  TestRenderer.act(() => row.findByType(Pressable).props.onPressIn())
  expect(StyleSheet.flatten(value().props.style).color).toBe(tokens.fg2)
  TestRenderer.act(() => row.findByType(Pressable).props.onPressOut())
  expect(StyleSheet.flatten(value().props.style).color).toBe(tokens.fg3)
  TestRenderer.act(() => tree.unmount())
})

beforeEach(() => {
  mocks.create.mockReset()
  mocks.canCreate = true
  mocks.grantAvailable = true
  mocks.error = null
})

function renderUnlockedKeys() {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />) })
  return tree
}

function buttonByLabel(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAllByType(PillButton).find((button: { props: { children: string } }) => button.props.children === label)!
}

function permissionSwitch(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAllByType(Pressable).find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
    node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === 'orbitMcp.readOnlyKeyLabel')!
}

it.each([true, false])('submits read-only permission %s for simple and scoped keys', async (readOnly) => {
  mocks.create.mockResolvedValue(null)
  const tree = renderUnlockedKeys()
  expect(permissionSwitch(tree).props.accessibilityState.checked).toBe(false)
  TestRenderer.act(() => permissionSwitch(tree).props.onPress())
  if (!readOnly) TestRenderer.act(() => permissionSwitch(tree).props.onPress())
  expect(permissionSwitch(tree).props.accessibilityState.checked).toBe(readOnly)
  await TestRenderer.act(async () => { await buttonByLabel(tree, 'profile.apiKeys.create').props.onClick() })
  expect(mocks.create).toHaveBeenLastCalledWith({ name: 'profile.apiKeys.newKeyName', isReadOnly: readOnly }, expect.any(Function))
  TestRenderer.act(() => buttonByLabel(tree, 'profile.apiKeys.createScoped').props.onClick())
  expect(buttonByLabel(tree, 'profile.apiKeys.scopeAction').props.disabled).toBe(true)
  const { Input } = await import('@/components/ui/input')
  TestRenderer.act(() => tree.root.findByType(Input).props.onChange('  habits:read  '))
  await TestRenderer.act(async () => { await buttonByLabel(tree, 'profile.apiKeys.scopeAction').props.onClick() })
  expect(mocks.create).toHaveBeenLastCalledWith({ name: 'profile.apiKeys.newKeyName', scopes: ['habits:read'], isReadOnly: readOnly }, expect.any(Function))
  TestRenderer.act(() => tree.unmount())
})

it('freezes permission and both create entries while a read-only request is pending', async () => {
  let finish!: () => void
  mocks.create.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(null) }))
  const tree = renderUnlockedKeys()
  TestRenderer.act(() => permissionSwitch(tree).props.onPress())
  TestRenderer.act(() => buttonByLabel(tree, 'profile.apiKeys.create').props.onClick())
  expect(permissionSwitch(tree).props.accessibilityState.disabled).toBe(true)
  expect(buttonByLabel(tree, 'profile.apiKeys.createScoped').props.disabled).toBe(true)
  expect(buttonByLabel(tree, 'profile.apiKeys.create').props.loading).toBe(true)
  await TestRenderer.act(async () => { finish(); await Promise.resolve() })
  expect(permissionSwitch(tree).props.disabled).toBe(false)
  TestRenderer.act(() => tree.unmount())
})

it('preserves the read-only choice when creation fails', async () => {
  mocks.create.mockResolvedValue(null)
  const tree = renderUnlockedKeys()
  TestRenderer.act(() => permissionSwitch(tree).props.onPress())
  await TestRenderer.act(async () => { await buttonByLabel(tree, 'profile.apiKeys.create').props.onClick() })
  mocks.error = 'orbitMcp.createKeyError'
  TestRenderer.act(() => tree.update(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />))
  expect(tree.root.findAllByType(Text).some((node: { props: { accessibilityRole?: string; children?: string } }) =>
    node.props.accessibilityRole === 'alert' && node.props.children === 'orbitMcp.createKeyError')).toBe(true)
  expect(permissionSwitch(tree).props.accessibilityState.checked).toBe(true)
  TestRenderer.act(() => tree.unmount())
})

it('hides permission at key capacity', () => {
  mocks.canCreate = false
  const tree = renderUnlockedKeys()
  expect(permissionSwitch(tree)).toBeUndefined()
  expect(tree.root.findAllByType(Text).some((node: { props: { children?: string } }) => node.props.children === 'orbitMcp.maxKeysReached')).toBe(true)
  TestRenderer.act(() => tree.unmount())
})
