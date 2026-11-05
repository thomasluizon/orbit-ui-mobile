import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { i18n } from '@/lib/i18n'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '../../support/interaction-fill-geometry'
import { chooseApiKeyCreation } from '../../support/api-key-creation'

vi.unmock('react-i18next')
const TestRenderer = require('react-test-renderer')
const context = vi.hoisted(() => ({ theme: 'dark' }))

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: context.theme }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(true) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}), useMutation: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile(), patchProfile: vi.fn(), invalidate: vi.fn() }) }))
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
    handleCreateKey: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => null }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => null }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

type JsonHost = { type: string; props: Record<string, unknown>; children: (JsonHost | string)[] | null }

function findHost(node: JsonHost | JsonHost[] | string | null, testID: string): JsonHost | null {
  if (!node || typeof node === 'string') return null
  if (Array.isArray(node)) return node.map((child) => findHost(child, testID)).find(Boolean) ?? null
  if (node.props.testID === testID) return node
  return (node.children ?? []).map((child) => findHost(child, testID)).find(Boolean) ?? null
}

afterEach(() => __resetTestHostConfig())

it.each([320, 1280].flatMap((width) => [1, 2].flatMap((scale) => (['en', 'pt-BR'] as const).flatMap((locale) => (['dark', 'light'] as const).map((mode) => ({ width, scale, locale, mode }))))))(
  'keeps the API key expiry question on the field edge at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
    await i18n.changeLanguage(locale)
    context.theme = mode
    __setWindowDimensions({ width: Math.min(width, 412), height: 915, scale: 1, fontScale: scale })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={createMockProfile({ hasProAccess: true })} unlocked />) })
    try {
      await chooseApiKeyCreation(tree, i18n.t('profile.apiKeys.create'), i18n.t('profile.apiKeys.create'))
      const column = width - 32
      const questions = findHost(tree.toJSON(), 'api-key-questions')!
      const bounds = measureInteractionFills(questions, column, true, scale)
      const question = i18n.t('profile.apiKeys.setExpiry')
      const title = bounds.find((part) => part.host.type === 'Text' && part.host.props['data-slot'] === 'list-row-title' && part.host.children?.includes(question))!
      const control = bounds.find((part) => part.host.type === 'Pressable' && (part.host.props as { accessibilityState?: { expanded?: boolean } }).accessibilityState?.expanded === false)!
      const fill = bounds.find((part) => part.host.props['data-slot'] === 'list-row-body' && part.ancestors.includes(control.slot))!
      expect(control.left).toBe(0)
      expect(control.right).toBe(column)
      expect(fill.left).toBe(0)
      expect(fill.right).toBe(column)
      expect(title.host.props.numberOfLines).toBeUndefined()
      expect(title.left).toBeGreaterThanOrEqual(8)
      expect(title.right).toBeLessThanOrEqual(column - 8)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })
