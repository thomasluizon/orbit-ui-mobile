import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Pressable, StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import type { Profile } from '@orbit/shared/types/profile'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Input } from '@/components/ui/input'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const mocks = vi.hoisted(() => ({ create: vi.fn(), error: null as string | null }))

const TestRenderer = require('react-test-renderer')

beforeEach(() => { mocks.error = null; mocks.create.mockReset() })

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
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
  TestRenderer.act(() => create.props.onClick())
  TestRenderer.act(() => tree.root.findByType(Input).props.onChange('Personal key'))
  const submit = tree.root.findAllByType(PillButton).find((button: { props: { children: string } }) => button.props.children === 'profile.apiKeys.scopeAction')!
  await TestRenderer.act(async () => { await submit.props.onClick() })
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

it.each([false, true])('asks for a name before creating a key with scoped=%s', async (scoped) => {
  mocks.create.mockResolvedValueOnce({ id: 'key', name: 'Key', key: 'key-value' })
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />) })
  const button = (label: string) => tree.root.findAllByType(PillButton).find((node: { props: { children: string } }) => node.props.children === label)!
  TestRenderer.act(() => button(scoped ? 'profile.apiKeys.createScoped' : 'profile.apiKeys.create').props.onClick())
  expect(mocks.create).not.toHaveBeenCalled()
  const name = () => tree.root.findAllByType(Input).find((node: { props: { label: string } }) => node.props.label === 'orbitMcp.keyName')!
  expect(name().props.placeholder).toBe('orbitMcp.keyNamePlaceholder')
  expect(name().props.required).toBe(true)
  if (scoped) TestRenderer.act(() => tree.root.findAllByType(Input).find((node: { props: { label: string } }) => node.props.label === 'profile.apiKeys.scopeLabel')!.props.onChange(' habits:read '))
  TestRenderer.act(() => name().props.onChange('   '))
  await TestRenderer.act(async () => { await button('profile.apiKeys.scopeAction').props.onClick() })
  expect(name().props.error).toBe('orbitMcp.keyNameRequired')
  expect(name().props.focusRequest).toBeGreaterThan(0)
  expect(mocks.create).not.toHaveBeenCalled()
  TestRenderer.act(() => name().props.onChange('x'.repeat(51)))
  await TestRenderer.act(async () => { await name().props.onSubmit() })
  expect(name().props.error).toBe('orbitMcp.keyNameMaxLength')
  expect(mocks.create).not.toHaveBeenCalled()
  TestRenderer.act(() => name().props.onChange(`  ${'x'.repeat(50)}  `))
  await TestRenderer.act(async () => { await button('profile.apiKeys.scopeAction').props.onClick() })
  expect(mocks.create).toHaveBeenCalledWith({ name: 'x'.repeat(50), ...(scoped ? { scopes: ['habits:read'] } : {}) }, expect.any(Function))
  expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['orbitMcp.done'])
  TestRenderer.act(() => tree.unmount())
})

it('keeps the name after a failed request and disables repeat submissions while pending', async () => {
  let finish!: () => void
  mocks.create.mockImplementationOnce(() => new Promise((resolve) => {
    finish = () => { mocks.error = 'orbitMcp.createKeyError'; resolve(null) }
  }))
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />) })
  const button = (label: string) => tree.root.findAllByType(PillButton).find((node: { props: { children: string } }) => node.props.children === label)!
  const name = () => tree.root.findAllByType(Input).find((node: { props: { label: string } }) => node.props.label === 'orbitMcp.keyName')!
  TestRenderer.act(() => button('profile.apiKeys.create').props.onClick())
  TestRenderer.act(() => name().props.onChange('Home automation'))
  await TestRenderer.act(async () => { await button('profile.apiKeys.scopeAction').props.onClick() })
  expect(button('profile.apiKeys.scopeAction').props.loading).toBe(true)
  expect(name().props.disabled).toBe(true)
  expect(button('common.cancel').props.disabled).toBe(true)
  await TestRenderer.act(async () => { await name().props.onSubmit() })
  expect(mocks.create).toHaveBeenCalledTimes(1)
  await TestRenderer.act(async () => { finish(); await Promise.resolve() })
  expect(tree.root.findAllByType(Text).some((node: { props: { children: string } }) => node.props.children === 'orbitMcp.createKeyError')).toBe(true)
  expect(name().props.value).toBe('Home automation')
  expect(button('profile.apiKeys.scopeAction').props.loading).toBe(false)
  mocks.error = null
  TestRenderer.act(() => button('common.cancel').props.onClick())
  TestRenderer.act(() => button('common.keepEditing').props.onClick())
  expect(name().props.value).toBe('Home automation')
  TestRenderer.act(() => button('common.cancel').props.onClick())
  TestRenderer.act(() => button('common.discardChangesAction').props.onClick())
  TestRenderer.act(() => button('profile.apiKeys.create').props.onClick())
  expect(name().props.value).toBe('')
  TestRenderer.act(() => tree.unmount())
})
