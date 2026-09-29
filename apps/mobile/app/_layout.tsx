import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BackHandler, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
  type ErrorBoundaryProps,
} from 'expo-router'
import { type Theme as NavigationTheme } from 'expo-router/react-navigation'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { Providers, useCaptureReady } from '@/lib/providers'
import { useAuthStore } from '@/stores/auth-store'
import { useGoogleErrorLogin } from '@/lib/google-auth-callback'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { mobileMotion } from '@/lib/motion'
import { syncWidgetTheme } from '@/lib/orbit-widget'
import {
  dismissOrFallback,
  getAndroidBackFallbackRoute,
} from '@/lib/back-navigation'
import { dismissTopOverlay } from '@/lib/overlay-stack'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import {
  getReferralLevelMilestone,
  getMilestoneShareStreakKey,
  getMilestoneShareAchievementKey,
  getReviewMomentLevelKey,
  MARKETING_CONSENT_MILESTONE_KEY,
} from '@orbit/shared/stores'
import {
  formatAPIDate,
  isShareableAchievement,
  resolveShellChrome,
  resolveShellDestination,
} from '@orbit/shared/utils'
import {
  isReviewMomentEligible,
  useReviewReminderStore,
} from '@/stores/review-reminder-store'
import { useLiveOnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import {
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'
import { DestinationTabBar } from '@/components/navigation/destination-tab-bar'
import { Shell412 } from '@/components/shell/shell-412'
import { Fab } from '@/components/ui/fab'
import { Plus } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { OverlayLayer } from '@/components/global-overlays'
import * as Sentry from '@sentry/react-native'
import { OfflineNotice } from '@/components/offline-notice'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { AppToast } from '@/components/ui/app-toast'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { FocusProvenanceView } from '@/components/ui/focus-provenance-view'
import { AstraConversation } from '@/components/chat/conversation'
import { Composer } from '@/components/shell/composer'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useCurrentDate } from '@/app/(tabs)/use-today-date'
import { getAccountId, useAccountId } from '@/lib/account-scope'
import { readShowGeneralOnToday } from '@/lib/show-general-on-today-storage'
import { useOffline } from '@/hooks/use-offline'
import { PushNotificationsProvider } from '@/hooks/use-push-notifications'
import { captureError } from '@/lib/sentry'
import { ThrottleScreen } from '@/components/throttle-screen'
import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'
import {
  captureBuildEnabled,
  captureRequestProbeIdFromUrl,
  captureRouteProbeId,
  shouldExposeOnboardingRoute,
} from '@/lib/capture-mode'

const SLIDE_FROM_RIGHT_SCREENS = [
  'support',
  'upgrade',
  'wrapped',
  'calendar-sync',
  'step-up',
] as const

function RootStackScreens({
  screenBackgroundColor,
}: Readonly<{ screenBackgroundColor: string }>) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const allowErrorLogin = useGoogleErrorLogin()
  const onboardingLocallyDone = useOnboardingDraftStore(
    (s) => s.onboardingLocallyDone,
  )

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: captureBuildEnabled ? 'none' : 'fade_from_bottom',
        animationDuration: captureBuildEnabled
          ? 0
          : mobileMotion.presets['route-push'].enterDuration,
        animationMatchesGesture: true,
        animationTypeForReplace: 'push',
        contentStyle: { backgroundColor: screenBackgroundColor },
      }}
    >
      <Stack.Protected
        guard={shouldExposeOnboardingRoute(
          captureBuildEnabled,
          isAuthenticated,
          onboardingLocallyDone,
        )}
      >
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated || allowErrorLogin}>
        <Stack.Screen
          name="login"
          options={{
            animation: captureBuildEnabled ? 'none' : 'fade',
            gestureEnabled: false,
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" />
        <Stack.Screen name="notifications" />
        <Stack.Screen
          name="chat"
          options={{
            animation: captureBuildEnabled ? 'none' : 'slide_from_right',
          }}
        />
        {SLIDE_FROM_RIGHT_SCREENS.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              animation: captureBuildEnabled ? 'none' : 'slide_from_right',
            }}
          />
        ))}
      </Stack.Protected>

      {/* Public, unguarded screens MUST stay declared LAST: Expo Router anchors the
          stack to the first AVAILABLE screen, so after login flips the guards the
          user lands on (tabs), not /privacy. Regression from #400; fix #431.
          https://docs.expo.dev/router/advanced/protected/ */}
      <Stack.Screen
        name="privacy"
        options={{ animation: captureBuildEnabled ? 'none' : 'fade' }}
      />
      <Stack.Screen
        name="terms"
        options={{ animation: captureBuildEnabled ? 'none' : 'fade' }}
      />
      <Stack.Screen name="r" />
      <Stack.Screen name="about" />
      <Stack.Screen
        name="auth-callback"
        options={{
          animation: captureBuildEnabled ? 'none' : 'fade',
          gestureEnabled: false,
        }}
      />
    </Stack>
  )
}

function getNoNavigationNotice(
  isAuthenticated: boolean,
  topSegment: string | undefined,
  notificationDeleteNotice: ReactNode,
) {
  if (!isAuthenticated) return undefined
  if (topSegment === 'wrapped' && notificationDeleteNotice === null) return undefined
  return <>{notificationDeleteNotice}{topSegment === 'wrapped' ? null : <OfflineNotice />}</>
}

function getComposerSelectedDate(date: string | string[] | undefined): string | undefined {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

function useComposerGeneralPreference(pathname: string): boolean {
  const accountId = useAccountId()
  const [snapshot, setSnapshot] = useState({ accountId, value: false })
  useEffect(() => {
    let active = true
    void readShowGeneralOnToday().then((value) => {
      if (active && getAccountId() === accountId) setSnapshot({ accountId, value })
    }).catch(() => {
      if (active && getAccountId() === accountId) setSnapshot({ accountId, value: false })
    })
    return () => { active = false }
  }, [accountId, pathname])
  return snapshot.accountId === accountId && snapshot.value
}

function RootLayoutNav() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const includeGeneral = useComposerGeneralPreference(pathname)
  const { from, date } = useGlobalSearchParams<{ from?: string | string[]; date?: string | string[] }>()
  const linkingUrl = Linking.useLinkingURL()
  const segments = useSegments()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const captureReady = useCaptureReady()
  const { profile } = useProfile()
  const today = useCurrentDate(profile?.timeZone)
  useTimezoneAutoSync(profile)
  const hasProAccess = useHasProAccess()
  const { count: totalHabitCount, isLoaded: habitCountLoaded } = useHabitCountLoaded()
  const { currentTheme, currentScheme, surfaces } = useAppTheme()
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const lastDestination = useUIStore((s) => s.lastDestination)
  const setLastDestination = useUIStore((s) => s.setLastDestination)
  const todayFabHidden = useUIStore((s) => s.todayFabHidden)
  const astraConversationOpen = useUIStore((s) => s.astraConversationOpen)
  const setAstraConversationOpen = useUIStore((s) => s.setAstraConversationOpen)
  const offline = useOffline()
  const chat = useChatComposer({
    isOnline: offline.isOnline,
    offlineTitle: t('chat.offline.title'),
    pathname,
    today,
    selectedDate: getComposerSelectedDate(date),
    totalHabitCount: habitCountLoaded ? totalHabitCount : null,
    includeGeneral,
  })
  useOnboardingFlush()

  const topSegment = segments[0] as string | undefined
  const isNotFound = topSegment === '+not-found'
  const shellChrome = resolveShellChrome(pathname, lastDestination)
  const destination = resolveShellDestination(pathname)
  useEffect(() => {
    if (destination && !isNotFound && pathname !== '/upgrade') setLastDestination(destination)
  }, [destination, isNotFound, pathname, setLastDestination])
  const captureProbeId = captureRouteProbeId(pathname, topSegment)
  const captureRequestId = captureRequestProbeIdFromUrl(
    captureBuildEnabled,
    linkingUrl,
  )
  const hideAppShellChrome =
    topSegment === 'login' ||
    topSegment === 'auth-callback' ||
    topSegment === 'chat' ||
    topSegment === 'step-up' ||
    topSegment === 'upgrade' ||
    topSegment === 'wrapped' ||
    topSegment === 'privacy' ||
    topSegment === 'terms' ||
    topSegment === 'r'

  const showBottomNav = isAuthenticated && !hideAppShellChrome
  const pendingNotificationDeleteIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  const failedNotificationDeleteIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getFailedNotificationDeleteIdsSnapshot,
    getFailedNotificationDeleteIdsSnapshot,
  )
  const notificationDeleteNotice = pendingNotificationDeleteIds.length > 0
    || failedNotificationDeleteIds.length > 0
    ? <NotificationDeleteNotice />
    : null
  const conversation = {
    conversation: <AstraConversation chat={chat} />,
    conversationOpen: astraConversationOpen,
    conversationLabel: t('todayAstra.openConversation'),
  }
  const androidBackFallbackRoute = useMemo(
    () =>
      getAndroidBackFallbackRoute(pathname, {
        isAuthenticated,
        upgradeFrom: from,
      }),
    [from, isAuthenticated, pathname],
  )

  const handleCreate = useMemo(
    () => () => {
      if (profile !== undefined && !hasProAccess && habitCountLoaded && totalHabitCount >= 10) {
        router.push(buildUpgradeHref(pathname || '/'))
        return
      }

      setShowCreateModal(true)
    },
    [
      hasProAccess,
      habitCountLoaded,
      profile,
      pathname,
      router,
      setShowCreateModal,
      totalHabitCount,
    ],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    syncWidgetTheme(currentScheme).catch(() => {})
  }, [currentScheme, isAuthenticated])

  useEffect(() => {
    if (Platform.OS !== 'android') return

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (dismissTopOverlay('system-back')) {
          return true
        }

        if (!androidBackFallbackRoute) return false

        dismissOrFallback(router, androidBackFallbackRoute)
        return true
      },
    )

    return () => subscription.remove()
  }, [androidBackFallbackRoute, router])

  return (
    <>
      <StatusBar
        animated={!captureBuildEnabled}
        hidden={captureBuildEnabled}
        style={currentTheme === 'dark' ? 'light' : 'dark'}
      />

      <View style={{ flex: 1 }}>
        {showBottomNav ? (
          <Shell412
            safeAreaTop={isNotFound || ['/', '/calendar', '/progress', '/profile', '/search'].includes(pathname)}
            {...conversation}
            composer={shellChrome.composer || isNotFound ? (
              <Composer
                {...chat.composerProps}
                onOpenConversation={() => setAstraConversationOpen(true)}
                conversationLabel={t('todayAstra.openConversation')}
                onSend={chat.composerProps.onSend}
              />
            ) : undefined}
            notice={<>
              <CelebrationPanel />
              {notificationDeleteNotice}
              <OfflineNotice />
            </>}
            tabBar={<DestinationTabBar pathname={pathname} notFound={isNotFound} />}
            fab={pathname === '/' && !todayFabHidden
              ? <AppCreateFab onCreate={handleCreate} />
              : undefined}
          >
            <RootStackScreens
              screenBackgroundColor={surfaces.screen.backgroundColor}
            />
          </Shell412>
        ) : (
          <Shell412
            nav={false}
            safeAreaTop={isNotFound || pathname === '/search'}
            notice={getNoNavigationNotice(
              isAuthenticated,
              topSegment,
              notificationDeleteNotice,
            )}
          >
            <RootStackScreens
              screenBackgroundColor={surfaces.screen.backgroundColor}
            />
          </Shell412>
        )}

        {captureBuildEnabled && captureReady ? (
          <CaptureProbes
            captureProbeId={captureProbeId}
            captureRequestId={captureRequestId}
          />
        ) : null}
      </View>

      {isAuthenticated ? <GlobalOverlays profile={profile} /> : null}
      {!isAuthenticated ? <AppToast /> : null}
    </>
  )
}

function CaptureProbes({
  captureProbeId,
  captureRequestId,
}: Readonly<{
  captureProbeId: string
  captureRequestId: string | null
}>) {
  return (
    <>
      <View
        accessibilityLabel={captureProbeId}
        accessible
        collapsable={false}
        importantForAccessibility="yes"
        pointerEvents="none"
        style={styles.captureProbe}
        testID={captureProbeId}
      />
      {captureRequestId ? (
        <View
          accessibilityLabel={captureRequestId}
          accessible
          collapsable={false}
          importantForAccessibility="yes"
          pointerEvents="none"
          style={styles.captureProbe}
          testID={captureRequestId}
        />
      ) : null}
    </>
  )
}

function GlobalOverlays({
  profile,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
}>) {
  const canViewGamification = profile?.canViewGamification ?? false
  const gamification = useGamificationProfile(canViewGamification)
  const { clearLevelUp, leveledUp, newLevel } = gamification
  const enqueueCelebration = useUIStore((state) => state.enqueueCelebration)
  const armReferralPrompt = useReferralPromptStore((s) => s.armReferralPrompt)
  const armMilestoneSharePrompt = useReferralPromptStore(
    (s) => s.armMilestoneSharePrompt,
  )
  const armReviewPrompt = useReferralPromptStore((s) => s.armReviewPrompt)
  const armConsentPrompt = useReferralPromptStore((s) => s.armConsentPrompt)
  useEffect(() => {
    if (!leveledUp || newLevel === null) return
    enqueueCelebration('level-up', { level: newLevel })
    clearLevelUp()
  }, [clearLevelUp, enqueueCelebration, leveledUp, newLevel])
  useEffect(() => {
    if (
      profile?.hasCompletedOnboarding &&
      profile.hasSeenImportPrompt &&
      profile.marketingEmailConsent === null
    ) {
      armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    }
  }, [
    profile?.hasCompletedOnboarding,
    profile?.hasSeenImportPrompt,
    profile?.marketingEmailConsent,
    armConsentPrompt,
  ])

  const pendingOnboardingAnswers = useOnboardingDraftStore((s) =>
    s.hasPendingAnswers(),
  )
  const liveOnboardingActions = useLiveOnboardingActions()
  const showRetainedOnboarding = useRetainedOnboardingGuard(
    profile,
    pendingOnboardingAnswers,
    useOnboardingDraftStore((state) => state.pushRegistrationFailed),
  )

  useEffect(() => {
    if (gamification.leveledUp && gamification.newLevel) {
      armReferralPrompt(getReferralLevelMilestone(gamification.newLevel))
      if (
        isReviewMomentEligible(
          useReviewReminderStore.getState(),
          profile?.hasCompletedOnboarding ?? false,
          formatAPIDate(new Date()),
        )
      ) {
        armReviewPrompt(getReviewMomentLevelKey(gamification.newLevel))
      }
    }
  }, [
    gamification.leveledUp,
    gamification.newLevel,
    armReferralPrompt,
    armReviewPrompt,
    profile?.hasCompletedOnboarding,
  ])

  useEffect(() => {
    const crossedStreak = gamification.crossedStreakMilestones.at(-1) ?? null
    const shareableAchievement = gamification.newAchievements.find(
      isShareableAchievement,
    )
    const achievementKey = shareableAchievement
      ? getMilestoneShareAchievementKey(shareableAchievement.id)
      : null
    const candidateKey =
      crossedStreak !== null ? getMilestoneShareStreakKey(crossedStreak) : achievementKey
    if (candidateKey) {
      armMilestoneSharePrompt(candidateKey)
    }
  }, [
    gamification.crossedStreakMilestones,
    gamification.newAchievements,
    armMilestoneSharePrompt,
  ])

  return (
    <OverlayLayer
      hasCompletedOnboarding={profile?.hasCompletedOnboarding ?? false}
      showRetainedOnboarding={showRetainedOnboarding}
      onboardingActions={liveOnboardingActions}
    />
  )
}

function RootLayoutContent() {
  const { currentScheme, currentTheme, surfaces } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const navigationTheme = useMemo<NavigationTheme>(() => {
    const baseTheme = currentTheme === 'dark' ? DarkTheme : DefaultTheme

    return {
      ...baseTheme,
      dark: currentTheme === 'dark',
      colors: {
        ...baseTheme.colors,
        primary: tokens.primary,
        background: surfaces.screen.backgroundColor,
        card: surfaces.elevated.backgroundColor,
        text: tokens.fg1,
        border: tokens.hairline,
        notification: tokens.primary,
      },
    }
  }, [
    tokens.hairline,
    tokens.primary,
    tokens.fg1,
    currentTheme,
    surfaces.elevated.backgroundColor,
    surfaces.screen.backgroundColor,
  ])

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <FocusProvenanceView
        style={[
          styles.shellRoot,
          { backgroundColor: surfaces.screen.backgroundColor },
        ]}
      >
        <RootLayoutNav />
        <ThrottleScreen />
        <UpgradeRequiredScreen />
      </FocusProvenanceView>
    </NavigationThemeProvider>
  )
}


function AppCreateFab({ onCreate }: Readonly<{ onCreate: () => void }>) {
  const { t } = useTranslation()
  return (
    <View>
      <Fab label={t('nav.createHabit')} onClick={onCreate}>
        <Plus size={24} strokeWidth={2} />
      </Fab>
    </View>
  )
}

const styles = StyleSheet.create({
  shellRoot: {
    flex: 1,
    overflow: 'hidden',
  },
  captureProbe: {
    height: 1,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
})

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <PushNotificationsProvider>
          <RootLayoutContent />
        </PushNotificationsProvider>
      </Providers>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)

export function ErrorBoundary({ error, retry }: Readonly<ErrorBoundaryProps>) {
  useEffect(() => {
    captureError(error)
  }, [error])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorScreen error={error} retry={() => void retry()} />
    </GestureHandlerRootView>
  )
}
