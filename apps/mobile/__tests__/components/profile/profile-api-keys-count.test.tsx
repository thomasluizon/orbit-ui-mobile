import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Pressable, StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import type { ApiKey } from '@orbit/shared/types'
import type { Profile } from '@orbit/shared/types/profile'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { i18n } from '@/lib/i18n'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Input } from '@/components/ui/input'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const mocks = vi.hoisted(() => ({ localize: false, create: vi.fn(), error: null as string | null, apiKeys: [] as ApiKey[], loading: false, loadError: null as Error | null, retry: vi.fn() }))

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => mocks.localize
    ? { t: i18n.t.bind(i18n), i18n }
    : { t: (key: string, params?: Record<string, unknown>) => params ? `${key}:${JSON.stringify(params)}` : key, i18n: { language: 'en' } },
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: mocks.loading, error: mocks.loadError, refetch: mocks.retry },
    apiKeys: mocks.apiKeys,
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
  const createAction = () => tree.root.findAllByType(PillButton).find((button: { props: { children: string } }) => button.props.children === 'profile.apiKeys.scopeAction')!
  expect(createAction().props.disabled).toBe(true)
  TestRenderer.act(() => tree.root.findAllByType(Input).find((input: { props: { label: string } }) => input.props.label === 'profile.apiKeys.scopeLabel')!.props.onChange('habits:read'))
  expect(createAction().props.disabled).toBe(false)
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
beforeEach(() => { mocks.error = null; mocks.create.mockReset(); mocks.localize = false; mocks.apiKeys = []; mocks.loading = false; mocks.loadError = null; mocks.retry.mockClear() })

const detailKey: ApiKey = {
  id: 'details-key', name: 'External tool', keyPrefix: 'orb_details', scopes: ['habits:read', 'goals:read'],
  isReadOnly: true, createdAtUtc: '2026-01-02T12:00:00Z', lastUsedAtUtc: '2026-02-03T12:00:00Z',
  expiresAtUtc: '2027-04-05T12:00:00Z', isRevoked: false,
}

function renderKeyDetails(unlocked = true) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked={unlocked} />) })
  return tree
}

function keyText(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAllByType(Text).map((node: { props: { children: React.ReactNode } }) => node.props.children).flat().join(' ')
}

it('shows scopes, dates, permissions and expiry in the unlocked Android list', () => {
  mocks.apiKeys = [detailKey]
  const tree = renderKeyDetails()
  const text = keyText(tree)
  expect(text).toContain('habits:read, goals:read')
  expect(text).toContain('orbitMcp.permReadOnly')
  expect(text).toContain('orbitMcp.created')
  expect(text).toContain('Jan 2, 2026')
  expect(text).toContain('orbitMcp.lastUsed')
  expect(text).toContain('Feb 3, 2026')
  expect(text).toContain('orbitMcp.expiresOn:{"date":"Apr 5, 2027"}')
  expect(tree.root.findByType(ListRow).props.action.label).toContain('profile.apiKeys.revokeNamed')
  TestRenderer.act(() => tree.unmount())
})

it('preserves no scopes, unused, read/write and no expiry states on Android', () => {
  mocks.apiKeys = [{ ...detailKey, scopes: [], isReadOnly: false, lastUsedAtUtc: null, expiresAtUtc: null }]
  const tree = renderKeyDetails()
  const text = keyText(tree)
  expect(text).toContain('orbitMcp.noScopes')
  expect(text).toContain('orbitMcp.never')
  expect(text).toContain('orbitMcp.permReadWrite')
  expect(text).not.toContain('orbitMcp.expiresOn')
  TestRenderer.act(() => tree.unmount())
})

it('withholds Android key details while locked or loading', () => {
  mocks.apiKeys = [detailKey]
  const tree = renderKeyDetails(false)
  expect(keyText(tree)).not.toContain('External tool')
  mocks.loading = true
  TestRenderer.act(() => tree.update(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />))
  expect(keyText(tree)).toContain('common.loading')
  expect(keyText(tree)).not.toContain('habits:read, goals:read')
  TestRenderer.act(() => tree.unmount())
})

it('offers retry instead of stale Android key details on failure', () => {
  mocks.apiKeys = [detailKey]
  mocks.loadError = new Error('unavailable')
  const tree = renderKeyDetails()
  expect(keyText(tree)).toContain('orbitMcp.apiKeysError')
  expect(keyText(tree)).not.toContain('External tool')
  const retry = tree.root.findAllByType(PillButton).find((button: { props: { children: string } }) => button.props.children === 'common.retry')!
  TestRenderer.act(() => retry.props.onClick())
  expect(mocks.retry).toHaveBeenCalledTimes(1)
  TestRenderer.act(() => tree.unmount())
})

it('localizes Android key details and dates in Brazilian Portuguese', async () => {
  mocks.localize = true
  await i18n.changeLanguage('pt-BR')
  mocks.apiKeys = [detailKey]
  const tree = renderKeyDetails()
  const text = keyText(tree)
  expect(text).toContain('Somente leitura')
  expect(text).toContain('2 de jan. de 2026')
  expect(text).toContain('Expira em 5 de abr. de 2027')
  TestRenderer.act(() => tree.unmount())
  await i18n.changeLanguage('en')
})
