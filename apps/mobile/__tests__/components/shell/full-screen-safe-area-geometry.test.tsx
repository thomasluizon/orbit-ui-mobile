import React, { type ComponentProps, type ReactElement } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockProfile, createMockRecap } from '@orbit/shared/__tests__/factories'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { FlowShell } from '@/components/shell/flow-shell'
import { Shell412 } from '@/components/shell/shell-412'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { LegalDocumentLayout } from '@/components/legal-document-layout'
import UpgradeScreen from '@/app/upgrade'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'
import { LoginContent } from '@/components/auth/login-content'
import { ProfileSubscreen } from '@/app/(tabs)/profile/_components/profile-subscreen'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { ThrottleScreen } from '@/components/throttle-screen'
import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { createTokensV2 } from '@/lib/theme'
import { useThrottleStore } from '@/stores/throttle-store'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

await vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module')
  const load = createRequire(import.meta.url)
  const nativePath = load.resolve('react-native')
  const nativeModule = new Module(nativePath)
  nativeModule.exports = await import('react-native')
  load.cache[nativePath] = nativeModule
  const svgPath = load.resolve('react-native-svg')
  const svgModule = new Module(svgPath)
  svgModule.exports = await import('react-native-svg')
  load.cache[svgPath] = svgModule
})
vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))

vi.mock('@/hooks/use-habits', () => ({}))
vi.mock('@/hooks/use-push-subscriptions', () => ({}))

const state = vi.hoisted(() => ({ top: 24, bottom: 16, isLive: false }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: state.top, bottom: state.bottom, left: 0, right: 0 }),
  SafeAreaView: ({ edges = ['top', 'right', 'bottom', 'left'], style, ...props }: ComponentProps<typeof View> & { edges?: readonly string[] }) => {
    const declared = StyleSheet.flatten(style ?? {})
    return <View {...props} testID="safe-area-owner" style={[declared, {
      paddingTop: Number(declared.paddingTop ?? declared.paddingVertical ?? declared.padding ?? 0) + (edges.includes('top') ? state.top : 0),
      paddingBottom: Number(declared.paddingBottom ?? declared.paddingVertical ?? declared.padding ?? 0) + (edges.includes('bottom') ? state.bottom : 0),
    }]} />
  },
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() }), useLocalSearchParams: () => ({}) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: { screen: { backgroundColor: createTokensV2().bg } } }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile(), isLoading: true, refetch: vi.fn(() => Promise.resolve({ data: createMockProfile() })), patchProfile: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleNotifications: [], notifications: [], visibleUnreadCount: 0, pendingDeleteIds: [], isLoading: true }) }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({}), useMarkAllNotificationsRead: () => ({}), useDeleteNotification: () => ({}), useDeleteAllNotifications: () => ({}) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ isLoading: true, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-play-billing', () => ({ usePlayBilling: () => ({ clearError: vi.fn() }) }))
vi.mock('@/hooks/use-subscription-plans', async (original) => ({ ...await original<typeof import('@/hooks/use-subscription-plans')>(), useSubscriptionPlans: () => ({ isLoading: true, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-subscription-status', () => ({ useSubscriptionStatus: () => ({ isLoading: true, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ shareRef: { current: null }, canShareFiles: false }) }))
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ isLoading: false, isSupported: true }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({ useOnboardingIsLive: () => state.isLive, useOnboardingActions: () => ({ finishOnboarding: vi.fn(), createHabit: vi.fn(), updateHabit: vi.fn() }) }))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => ({ ...createLoginScreenFixture('email', 'en'), openTerms: vi.fn(), openPrivacyPolicy: vi.fn(), setEmail: vi.fn(), sendCode: vi.fn(), signInWithGoogle: vi.fn() }) }))
vi.mock('@/hooks/use-onboarding-plan', () => ({ useOnboardingPlan: () => ({ plan: 'Trial', profile: createMockProfile({ isTrialActive: true, hasProAccess: true }), loading: false }) }))
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/lib/i18n', () => ({ i18n: { t: (key: string) => key } }))
vi.mock('@/lib/app-version', () => ({ getAppVersion: () => '1.0.0' }))
vi.mock('react-native-gesture-handler', async (original) => {
  const actual = await original<typeof import('react-native-gesture-handler')>()
  return { ...actual, Gesture: { ...actual.Gesture, Pan: () => {
    const gesture = { activeOffsetY: () => gesture, failOffsetY: () => gesture, onEnd: () => gesture }
    return gesture
  } } }
})

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const recap = createMockRecap()
const tokens = createTokensV2()
const noop = () => {}
const legalProps = { title: 'Legal', lastUpdated: 'Version', sections: [], closingNote: { id: 'closing', title: 'Closing', paragraphs: [] }, backLabel: 'Back', onBack: noop }

const surfaces: { name: string; content: () => ReactElement; modal?: boolean; aligned?: boolean }[] = [
  { name: 'FlowShell for habit detail and step-up', content: () => <FlowShell nav={false} header={<Text accessibilityRole="header">Flow</Text>}><View /></FlowShell>, aligned: true },
  { name: 'Avisos inbox', content: () => <NotificationInbox /> },
  { name: 'legal layout', content: () => <LegalDocumentLayout {...legalProps} /> },
  { name: 'upgrade', content: () => <UpgradeScreen /> },
  { name: 'Wrapped player', content: () => <WrappedPlayer recap={recap} slides={buildWrappedSlides(recap)} period="week" tokens={tokens} onClose={noop} /> },
  { name: 'login', content: () => <LoginContent /> },
  { name: 'auth callback content', content: () => <LoginContent callback={{ state: 'account', onContinue: noop }} /> },
  { name: 'Perfil sub-screen', content: () => <ProfileSubscreen screen="preferences" /> },
  { name: 'habit create screen', content: () => <HabitCreateFrame presentation="screen" fromConversation={false} leaving={false} open title="Create" onClose={noop}><View /></HabitCreateFrame> },
  { name: 'onboarding decision modal', content: () => <OnboardingFlow />, modal: true },
  { name: 'onboarding final modal', content: () => <OnboardingFlow finalStepOnly />, modal: true },
  { name: 'throttle modal', content: () => { useThrottleStore.setState({ error: new Error('throttled') }); return <ThrottleScreen /> }, modal: true },
  { name: 'update-required modal', content: () => { useVersionGateStore.getState().markUpgradeRequired('2.0.0'); return <UpgradeRequiredScreen /> }, modal: true },
]

afterEach(() => { useThrottleStore.getState().clear(); useVersionGateStore.setState({ upgradeRequired: false, minVersion: null }); useOnboardingDraftStore.getState().reset() })

it.each(surfaces)('keeps $name below the top inset; new full-screen owners must join this table', async (surface) => {
  for (const top of [0, 24, 48]) {
    state.top = top
    const content = surface.content()
    let tree!: GeometryTree
    await renderer.act(() => { tree = renderer.create(surface.modal ? content : <Shell412 nav={false} safeAreaTop={false}>{content}</Shell412>) as GeometryTree })
    try {
      const host = tree.toJSON()
      let headerCount = 0
      const geometry = measureSafeArea(host, (host) => {
        if (host.props.accessibilityRole === 'header') return `header-${headerCount++}`
        if (host.props.testID === 'safe-area-owner' || host.props.testID === 'shell-background') return 'owner'
        if (host.props.testID === 'wrapped-header') return 'wrapped'
        if (host.type === 'KeyboardAvoidingView' && ['login', 'auth callback content'].includes(surface.name)) return 'login'
      })
      expect(headerCount, surface.name).toBeGreaterThan(0)
      for (const [key, box] of geometry) {
        if (key.startsWith('header-')) expect(box.top, `${surface.name} ${key}`).toBeGreaterThanOrEqual(top)
      }
      const owner = geometry.get('wrapped') ?? geometry.get('login') ?? geometry.get('owner')
      expect(owner, surface.name).toBeDefined()
      expect(owner!.contentTop, surface.name).toBe(surface.name === 'Wrapped player' ? Math.max(8, top) : top)
      if (surface.aligned) expect(geometry.get('header-0')!.top).toBe(top)
      if (surface.modal) expect(tree.root.findAll((node) => String(node.type) === 'Modal' && node.props.visible === true)).toHaveLength(1)
    } finally { await renderer.act(() => tree.unmount()) }
  }
})
