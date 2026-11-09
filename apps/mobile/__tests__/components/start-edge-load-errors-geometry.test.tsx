import type { ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PADDING } from '@orbit/shared/theme'
import SearchScreen from '@/app/search'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { GoalLoadError } from '@/components/goals/goal-detail-drawer/goal-load-error'
import { createStyles } from '@/components/goals/goal-detail-drawer/styles'
import { GoalHabitsPicker } from '@/components/goals/goal-habits-field'
import { createTokensV2 } from '@/lib/theme'
import { i18n } from '@/lib/i18n'
import { measureStartEdgeIconAction } from '@/__tests__/support/start-edge-icon-action'

vi.unmock('react-i18next')
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(true) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}), useMutation: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ timeZone: 'UTC' }), patchProfile: vi.fn(), invalidate: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useSearchHabits: () => ({ data: undefined, isPending: false, isFetching: false, isSuccess: false, isError: true, refetch: vi.fn() }),
  useHabits: () => ({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: () => ({ mutate: vi.fn(), isPending: false }), useSkipHabit: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: new Error('API keys unavailable'), refetch: vi.fn() },
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

const tokens = createTokensV2('orange', 'dark')
const goalStyles = createStyles(tokens)

const owners: { name: string; texts: number; render: () => ReactElement; message: string; typeQuery?: boolean; columnInset?: number }[] = [
  { name: 'habit search load error', texts: 1, message: 'habits.search.loadError', render: () => <SearchScreen />, typeQuery: true },
  { name: 'MCP API keys load error', texts: 1, message: 'orbitMcp.apiKeysError', render: () => <View style={{ paddingHorizontal: PADDING.screenGutter }}><ProfileApiKeys profile={createMockProfile({ hasProAccess: true })} unlocked /></View> },
  { name: 'goal detail inline load error', texts: 1, message: 'goals.detail.loadError', render: () => <View style={{ paddingHorizontal: PADDING.screenGutter }}><View style={{ gap: 24 }}><GoalLoadError onRetry={vi.fn()} styles={goalStyles} /></View></View>, columnInset: PADDING.screenGutter },
  { name: 'goal detail sheet load error', texts: 1, message: 'goals.detail.loadError', render: () => <View style={{ paddingHorizontal: PADDING.sheetInline }}><View style={{ gap: 24 }}><GoalLoadError onRetry={vi.fn()} styles={goalStyles} /></View></View>, columnInset: PADDING.sheetInline },
  { name: 'linked habits load error', texts: 1, message: 'goals.form.habitsError', render: () => <View style={{ paddingHorizontal: PADDING.sheetInline }}><GoalHabitsPicker selectedIds={[]} goalType="Standard" disabled={false} onChange={vi.fn()} onClose={vi.fn()} /></View> },
]

beforeEach(() => { vi.useFakeTimers() })
afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('start-edge retry actions below load error text', () => {
  it.each(owners.flatMap((owner) => ([412, 1280] as const).flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ ...owner, width, locale })))))(
    'centres the $name glyph and starts it on the text column at $width in $locale', async ({ render, texts, message, typeQuery, columnInset, width, locale }) => {
      await i18n.changeLanguage(locale)
      let tree!: ReactTestRenderer & Parameters<typeof measureStartEdgeIconAction>[0]
      await act(() => { tree = create(render()) as typeof tree })
      try {
        if (typeQuery) {
          const input = tree.root.findAll((node) => String(node.type) === 'TextInput')[0]!
          await act(() => { (input.props.onChangeText as (value: string) => void)('walk') })
          await act(() => { vi.advanceTimersByTime(300) })
        }
        const geometry = measureStartEdgeIconAction(tree, width, i18n.t('common.retry'))
        const detail = JSON.stringify(geometry)
        const hitExtension = (geometry.targetWidth - geometry.paint.width) / 2
        expect(geometry.texts.length, detail).toBe(texts)
        expect(geometry.paint.width, detail).toBe(44)
        expect(geometry.targetWidth, detail).toBe(48)
        expect(Math.abs((geometry.glyph.left + geometry.glyph.right) / 2 - (geometry.paint.left + geometry.paint.right) / 2), detail).toBeLessThanOrEqual(0.5)
        expect(Math.abs((geometry.glyph.top + geometry.glyph.bottom) / 2 - (geometry.paint.top + geometry.paint.bottom) / 2), detail).toBeLessThanOrEqual(0.5)
        expect(Math.abs(geometry.glyph.left - geometry.texts[0]!.left), detail).toBeLessThanOrEqual(0.5)
        expect(geometry.texts[0]!.left - geometry.root.left, detail).toBeGreaterThanOrEqual(14)
        expect(geometry.paint.left - hitExtension, detail).toBeGreaterThanOrEqual(geometry.root.left)
        const text = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === i18n.t(message))[0]!
        expect(StyleSheet.flatten(text.props.style)).toMatchObject({ fontSize: 14, color: tokens.statusBadText })
        if (columnInset !== undefined) expect(Math.abs(geometry.texts[0]!.left - geometry.root.left - columnInset), detail).toBeLessThanOrEqual(0.5)
      } finally { await act(() => tree.unmount()) }
    })
})
