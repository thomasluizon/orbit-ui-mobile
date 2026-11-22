import { chooseApiKeyCreation, revealApiKeyExpiry } from '@/__tests__/support/api-key-creation'
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
import { Sheet } from '@/components/ui/sheet'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

import StepUpScreen from '@/app/step-up'
import { OtpInput } from '@/components/ui/otp-input'
import { API } from '@orbit/shared/api'
import { bindStepUpStateToAccount, clearApiKeyCreationGrant, clearStepUpState, hasApiKeyCreationGrant, retainApiKeyExpiryDraft, markStepUpVerified } from '@/lib/step-up-storage'


const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), apiClient: vi.fn(), accountId: 'user-1', create: vi.fn(), canCreate: true, grantAvailable: true, error: null as string | null, localize: false, apiKeys: [] as ApiKey[], loading: false, loadError: null as Error | null, retry: vi.fn() }))


const TestRenderer = require('react-test-renderer')

vi.mock('@react-native-async-storage/async-storage', () => {
  const entries = new Map<string, string>()
  return { default: { getItem: (key: string) => Promise.resolve(entries.get(key) ?? null), setItem: (key: string, value: string) => { entries.set(key, value); return Promise.resolve() }, removeItem: (key: string) => { entries.delete(key); return Promise.resolve() } } }
})

vi.mock('@/components/ui/icon', () => ({ Icon: () => null }))
vi.mock('expo-router', () => ({ useRouter: () => mocks, useLocalSearchParams: () => ({ operation: 'keys' }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.apiClient(...args) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-logout', () => ({ useLogout: () => vi.fn() }))
vi.mock('@/components/shell/flow-shell', () => ({ FlowShell: ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => <>{children}{action}</> }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => mocks.localize
    ? { t: i18n.t.bind(i18n), i18n }
    : { t: (key: string, params?: Record<string, unknown>) => params ? `${key}:${JSON.stringify(params)}` : key, i18n: { language: 'en' } },
}))

vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(true) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: mocks.loading, error: mocks.loadError, refetch: mocks.retry },
    apiKeys: mocks.apiKeys,
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
vi.mock('@/stores/auth-store', () => ({ useAuthStore: Object.assign(
  (selector: (state: unknown) => unknown) => selector({ user: { userId: mocks.accountId }, sessionPhase: 'signed-in' }),
  { getState: () => ({ user: { userId: mocks.accountId }, sessionPhase: 'signed-in' }) },
) }))
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

it.each([0, 1, 3])('uses the meta role for %i active keys', (count) => {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true, activeApiKeyCount: count } as Profile} unlocked={false} />)
  })
  const row = tree.root.findByType(ListRow)
  const value = row.findAllByType(Text).find((node: { props: { label?: string; children: string } }) => node.props.children === row.props.value)!
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
  const value = () => row.findAllByType(Text).find((node: { props: { label?: string; children: string } }) => node.props.children === row.props.value)!
  const tokens = createTokensV2('purple', 'dark')
  expect(StyleSheet.flatten(value().props.style).color).toBe(tokens.fg3)
  TestRenderer.act(() => row.findByType(Pressable).props.onPressIn())
  expect(StyleSheet.flatten(value().props.style).color).toBe(tokens.fg2)
  TestRenderer.act(() => row.findByType(Pressable).props.onPressOut())
  expect(StyleSheet.flatten(value().props.style).color).toBe(tokens.fg3)
  TestRenderer.act(() => tree.unmount())
})
beforeEach(() => {
  clearStepUpState()
  mocks.accountId = 'user-1'
  bindStepUpStateToAccount(mocks.accountId)
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.apiClient.mockReset().mockResolvedValue(undefined)
  mocks.create.mockReset()
  mocks.canCreate = true
  mocks.grantAvailable = true
  mocks.error = null
  mocks.localize = false
  mocks.apiKeys = []
  mocks.loading = false
  mocks.loadError = null
  mocks.retry.mockReset()
})

async function submitNamedKey(tree: ReturnType<typeof TestRenderer.create>) {
  TestRenderer.act(() => tree.root.findByProps({ label: 'orbitMcp.keyName' }).props.onChange('Personal key'))
  await TestRenderer.act(async () => { await buttonByLabel(tree, 'profile.apiKeys.scopeAction').props.onClick() })
}

function renderUnlockedKeys() {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />) })
  return tree
}

function buttonByLabel(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAllByType(PillButton).find((button: { props: { label?: string; children: string } }) => (button.props.label ?? button.props.children) === label)!
}

function permissionSwitch(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAllByType(Pressable).find((node: { props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
    node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === 'orbitMcp.readOnlyKeyLabel')!
}

it('hides permission at key capacity', () => {
  mocks.canCreate = false
  const tree = renderUnlockedKeys()
  expect(permissionSwitch(tree)).toBeUndefined()
  expect(tree.root.findAllByType(Text).some((node: { props: { children?: string } }) => node.props.children === 'orbitMcp.maxKeysReached')).toBe(true)
  TestRenderer.act(() => tree.unmount())
})

async function submitScopedKey(tree: ReturnType<typeof TestRenderer.create>) {
  await chooseApiKeyCreation(tree, 'profile.apiKeys.createScoped')
  TestRenderer.act(() => tree.root.findByProps({ label: 'profile.apiKeys.scopeLabel' }).props.onChange('habits:read'))
  await submitNamedKey(tree)
}

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
  const keyRow = tree.root.findAllByType(ListRow).find((row: { props: { title: string } }) => row.props.title === detailKey.name)!
  expect(keyRow.props.action.label).toContain('profile.apiKeys.revokeNamed')
  TestRenderer.act(() => tree.unmount())
})

it('preserves no scopes, unused, read/write and no expiry states on Android', () => {
  mocks.apiKeys = [{ ...detailKey, scopes: [], isReadOnly: false, lastUsedAtUtc: null, expiresAtUtc: null }]
  const tree = renderKeyDetails()
  const text = keyText(tree)
  expect(text).toContain('orbitMcp.noScopes')
  expect(text).toContain('orbitMcp.never')
  expect(text).toContain('orbitMcp.permReadWrite')
  expect(text).toContain('common.never')
  expect(text).not.toContain('orbitMcp.expiresOn')
  TestRenderer.act(() => tree.unmount())
})

it.each(['en', 'pt-BR'] as const)('reads existing Android key expiry without opening creation or reveal in %s', async (locale) => {
  mocks.localize = true
  await i18n.changeLanguage(locale)
  mocks.apiKeys = [{ ...detailKey, expiresAtUtc: null }]
  const tree = renderKeyDetails()
  expect(keyText(tree)).toContain(i18n.t('common.never'))
  expect(keyText(tree)).toContain(detailKey.name)
  expect(keyText(tree)).toContain(i18n.t('orbitMcp.permReadOnly'))
  expect(tree.root.findAllByType(Input)).toHaveLength(0)
  expect(tree.root.findAllByType(Sheet)).toHaveLength(0)
  expect(mocks.create).not.toHaveBeenCalled()

  mocks.apiKeys = [detailKey]
  TestRenderer.act(() => tree.update(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />))
  expect(keyText(tree)).not.toContain(i18n.t('common.never'))
  expect(keyText(tree)).toContain(locale === 'en' ? 'Expires Apr 5, 2027' : 'Expira em 5 de abr. de 2027')
  TestRenderer.act(() => tree.unmount())
  await i18n.changeLanguage('en')
})

it('withholds Android key details while locked or loading', () => {
  mocks.apiKeys = [detailKey]
  const tree = renderKeyDetails(false)
  expect(keyText(tree)).not.toContain('External tool')
  mocks.loading = true
  TestRenderer.act(() => tree.update(<ProfileApiKeys profile={{ hasProAccess: true } as Profile} unlocked />))
  expect(keyText(tree)).not.toContain('common.loading')
  const skeleton = tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-settings')
  expect(skeleton).toHaveLength(1)
  expect(skeleton[0]!.props).toMatchObject({ accessibilityRole: 'progressbar', accessibilityLabel: 'common.loading', accessibilityState: { busy: true } })
  expect(tree.root.findAll((node: { type: unknown }) => node.type === 'ActivityIndicator')).toHaveLength(0)
  expect(keyText(tree)).not.toContain('habits:read, goals:read')
  TestRenderer.act(() => tree.unmount())
})

it('offers retry instead of stale Android key details on failure', () => {
  mocks.apiKeys = [detailKey]
  mocks.loadError = new Error('unavailable')
  const tree = renderKeyDetails()
  expect(keyText(tree)).toContain('orbitMcp.apiKeysError')
  expect(keyText(tree)).not.toContain('External tool')
  const retry = tree.root.findAllByType(PillButton).find((button: { props: { label?: string; children: string } }) => (button.props.label ?? button.props.children) === 'common.retry')!
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

function expiryQuestion(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAllByType(ListRow).find((row: { props: { title?: string } }) => row.props.title === 'profile.apiKeys.setExpiry')!
}

function expiryInputs(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAllByType(Input).filter((field: { props: { label: string } }) => field.props.label === 'orbitMcp.expiresAtLabel')
}
