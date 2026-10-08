'use client'

import { resolveComposerDockSuggestions } from '@orbit/shared/chat'

import { useEffect, useCallback, useId, useState, useSyncExternalStore, useLayoutEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Providers } from '@/lib/providers'
import { DestinationShell } from '@/components/shell/destination-shell'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { ActionRow } from '@/components/ui/action-row'
import { RetainedOnboardingOverlay } from '@/components/onboarding/retained-onboarding-overlay'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import {
  getReferralLevelMilestone,
  getMilestoneShareAchievementKey,
  getMilestoneShareStreakKey,
  hasOpenPromptBlockingOverlay,
  MARKETING_CONSENT_MILESTONE_KEY,
} from '@orbit/shared/stores'
import { dismissCalendarImport } from '@/lib/actions/calendar'
import { dismissImportPrompt } from '@/lib/actions/onboarding'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOnboardingCompletionQueue } from '@/hooks/use-onboarding-completion-queue'
import { useOnboardingProPending } from '@/hooks/use-onboarding-pro-pending'
import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import {
  useOnboardingDraftHydrated,
  useOnboardingHasPendingAnswers,
  useOnboardingDraftStore,
} from '@/stores/onboarding-draft-store'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { CHAT_TEXT_FILE_WEB_ACCEPT } from '@orbit/shared/chat'
import { Composer } from '@/components/shell/composer'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { CommandPaletteBackground } from '@/components/command/command-palette'
import { TodayProvider, useToday } from './today-provider'
import { readShowGeneralOnToday } from '@/lib/show-general-on-today-storage'
import {
  isCalendarPromptCriteriaMet,
  isImportPromptCriteriaMet,
  shouldSuppressOnboardingOverlay,
} from './onboarding-overlay-state'
import { ApiFetchI18nProvider } from '@/lib/api-fetch-i18n-provider'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { HABIT_CREATE_OVERLAY_ID, buildHabitCreateHref, formatAPIDate, isShareableAchievement } from '@orbit/shared/utils'
import { AccountEventConnection } from '@/lib/account-event-connection'
import { isPublicPath } from '@/lib/public-paths'
import { useHasSessionCookie } from '@/lib/session-cookie-provider'

const AstraConversation = dynamic(
  () => import('@/components/chat/conversation').then((module) => module.AstraConversation),
  { ssr: false },
)

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const sessionInactive = useAuthStore((state) => state.sessionInactive)
  const sessionRefreshFailed = useAuthStore((state) => state.sessionRefreshFailed)
  const hasSessionCookie = useHasSessionCookie()
  const restoringAboutSession = pathname === '/about' && hasSessionCookie && !sessionInactive && !sessionRefreshFailed
  if (!isAuthenticated && !restoringAboutSession && isPublicPath(pathname)) return <>{children}<AppToastHost placement="page" /></>
  return (
    <Providers>
      <AccountEventConnection />
      <TodayProvider>
        <AppLayoutContent>{children}</AppLayoutContent>
      </TodayProvider>
    </Providers>
  )
}

function getSelectedDateFromParam(dateParam: string | null): string {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
  return formatAPIDate(new Date())
}

function OpenAstraFromQuery({ pathname, onOpen }: Readonly<{
  pathname: string
  onOpen: (open: boolean) => void
}>) {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams.get('astra') !== 'open') return
    onOpen(true)
    router.replace(pathname)
  }, [onOpen, pathname, router, searchParams])

  return null
}

function PushHabitCreateFromQuery({ pathname, activeView, onNavigated }: Readonly<{
  pathname: string
  activeView: string
  onNavigated: () => void
}>) {
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    if (!useUIStore.getState().showCreateModal) return
    const from = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`
    const conversation = useUIStore.getState().astraConversationOpen
    useUIStore.getState().registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    onNavigated()
    useUIStore.getState().setAstraConversationOpen(false)
    setRouteTransitionIntent('forward')
    router.push(buildHabitCreateHref({ from, conversation, date: activeView === 'today' && pathname === '/' ? getSelectedDateFromParam(searchParams.get('date')) : null }))
  }, [activeView, onNavigated, pathname, router, searchParams])
  return null
}

function subscribeToGeneralPreference() { return () => {} }
function readServerGeneralPreference() { return false }

function SyncComposerDate({ onChange }: Readonly<{ onChange: (date: string | undefined) => void }>) {
  const searchParams = useSearchParams()
  const date = searchParams.get('date')
  useLayoutEffect(() => {
    onChange(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined)
  }, [date, onChange])
  return null
}

function AppLayoutContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const { profile, patchProfile } = useProfile()
  const today = useToday(profile?.timeZone)
  const [composerDate, setComposerDate] = useState<string | undefined>()
  const includeGeneral = useSyncExternalStore(subscribeToGeneralPreference, readShowGeneralOnToday, readServerGeneralPreference)
  const { isOnline } = useOffline()
  const [showCreateRefusal, setShowCreateRefusal] = useAccountScopedState(false)
  useEffect(() => {
    setShowCreateRefusal(false)
  }, [pathname, isOnline, setShowCreateRefusal])
  useTimezoneAutoSync(profile)
  useOnboardingFlush()
  const draftHydrated = useOnboardingDraftHydrated()
  const hasPendingOnboardingAnswers = useOnboardingHasPendingAnswers()
  const hasProAccess = profile?.hasProAccess ?? false
  const canViewGamification = profile?.canViewGamification ?? false
  const { count: totalHabitCount, isLoaded: habitCountLoaded } = useHabitCountLoaded()

  useEffect(() => {
    const cleanup = useAuthStore.getState().startExpiryMonitor()
    return cleanup
  }, [])

  useEffect(() => {
    for (const tabRoute of ['/', '/calendar', '/progress', '/profile']) {
      router.prefetch(tabRoute)
    }
  }, [router])
  const activeView = useUIStore((s) => s.activeView)
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const astraConversationOpen = useUIStore((s) => s.astraConversationOpen)
  const wideDesktop = useIsWideDesktop()
  const toastInConversation = astraConversationOpen && !wideDesktop
  const setAstraConversationOpen = useUIStore((s) => s.setAstraConversationOpen)
  const {
    fileInputRef,
    textFileInputRef,
    handleFileSelect,
    handleTextFileSelect,
    ...chat
  } = useChatComposer({
    pathname,
    today,
    selectedDate: pathname === '/' ? composerDate : undefined,
    totalHabitCount: habitCountLoaded ? totalHabitCount : null,
    includeGeneral,
  })

  const [showCalendarPrompt, setShowCalendarPrompt] = useAccountScopedState(false)
  const { sheetRef: calendarSheetRef, closeSheet: closeCalendarSheet } = useSheetHost()
  const [calendarPromptOffered, setCalendarPromptOffered] = useAccountScopedState(false)
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const calendarPromptId = useId()
  const importPromptId = useId()
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)

  const calendarPromptCriteriaMet = isCalendarPromptCriteriaMet(profile, pathname)
  const [previousCriteriaMet, setPreviousCriteriaMet] = useAccountScopedState(calendarPromptCriteriaMet)
  if (calendarPromptCriteriaMet !== previousCriteriaMet) {
    setPreviousCriteriaMet(calendarPromptCriteriaMet)
    if (!calendarPromptCriteriaMet) setCalendarPromptOffered(false)
  }
  useEffect(() => {
    if (!calendarPromptCriteriaMet || calendarPromptOffered || anotherOverlayOpen) return
    if (!useUIStore.getState().tryReservePromptOverlay(calendarPromptId)) return
    setCalendarPromptOffered(true)
    setShowCalendarPrompt(true)
  }, [anotherOverlayOpen, calendarPromptCriteriaMet, calendarPromptId, calendarPromptOffered, setCalendarPromptOffered, setShowCalendarPrompt])
  useEffect(() => {
    if (!showCalendarPrompt) return
    return () => unregisterOpenOverlay(calendarPromptId)
  }, [calendarPromptId, showCalendarPrompt, unregisterOpenOverlay])

  const [showImportPrompt, setShowImportPrompt] = useAccountScopedState(false)
  const { sheetRef: importSheetRef, closeSheet: closeImportSheet } = useSheetHost()
  const [importPromptOffered, setImportPromptOffered] = useAccountScopedState(false)

  const importPromptCriteriaMet = isImportPromptCriteriaMet(profile, {
    calendarPromptCriteriaMet,
    showCalendarPrompt,
    hasPendingOnboardingAnswers,
  })
  const [previousImportCriteriaMet, setPreviousImportCriteriaMet] = useAccountScopedState(importPromptCriteriaMet)
  if (importPromptCriteriaMet !== previousImportCriteriaMet) {
    setPreviousImportCriteriaMet(importPromptCriteriaMet)
    if (!importPromptCriteriaMet) setImportPromptOffered(false)
  }
  useEffect(() => {
    if (!importPromptCriteriaMet || importPromptOffered || anotherOverlayOpen) return
    if (!useUIStore.getState().tryReservePromptOverlay(importPromptId)) return
    setImportPromptOffered(true)
    setShowImportPrompt(true)
  }, [anotherOverlayOpen, importPromptCriteriaMet, importPromptId, importPromptOffered, setImportPromptOffered, setShowImportPrompt])
  useEffect(() => {
    if (!showImportPrompt) return
    return () => unregisterOpenOverlay(importPromptId)
  }, [importPromptId, showImportPrompt, unregisterOpenOverlay])

  const handleCreate = useCallback(() => {
    if (pathname === '/habits/new') return
    if (!isOnline) {
      setShowCreateRefusal(true)
      return
    }
    setShowCreateRefusal(false)
    if (profile !== undefined && !hasProAccess && habitCountLoaded && totalHabitCount >= 10) {
      setRouteTransitionIntent('forward')
      router.push('/upgrade')
      return
    }
    setShowCreateModal(true)
  }, [pathname, isOnline, profile, hasProAccess, habitCountLoaded, totalHabitCount, router, setShowCreateModal, setShowCreateRefusal])

  const handleDismissCalendarPrompt = useCallback(() => {
    setShowCalendarPrompt(false)
    dismissCalendarImport(getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
    })
  }, [setShowCalendarPrompt, showPersistentError, t])


  const handleCalendarImport = useCallback(() => {
    closeCalendarSheet(() => {
      handleDismissCalendarPrompt()
      setRouteTransitionIntent('forward')
      router.push('/calendar?import=1')
    })
  }, [closeCalendarSheet, handleDismissCalendarPrompt, router])


  const handleCalendarPromptOpenChange = useCallback(
    (open: boolean) => {
      if (!open && showCalendarPrompt) {
        handleDismissCalendarPrompt()
      }
    },
    [showCalendarPrompt, handleDismissCalendarPrompt],
  )

  const handleDismissImportPrompt = useCallback(() => {
    setShowImportPrompt(false)
    dismissImportPrompt(getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
    })
    patchProfile({ hasSeenImportPrompt: true })
  }, [patchProfile, setShowImportPrompt, showPersistentError, t])


  const handleImportWithAstra = useCallback(() => {
    closeImportSheet(() => {
      handleDismissImportPrompt()
      if ('localStorage' in globalThis) {
        globalThis.localStorage.setItem(
          CHAT_DRAFT_STORAGE_KEY,
          t('onboarding.flow.meetAstra.importPrompt'),
        )
      }
      setRouteTransitionIntent('forward')
      setAstraConversationOpen(true)
    })
  }, [closeImportSheet, handleDismissImportPrompt, setAstraConversationOpen, t])


  const handleImportPromptOpenChange = useCallback(
    (open: boolean) => {
      if (!open && showImportPrompt) {
        handleDismissImportPrompt()
      }
    },
    [showImportPrompt, handleDismissImportPrompt],
  )

  return (
    <CommandPaletteBackground className="relative isolate min-h-dvh overflow-x-clip bg-[var(--bg)] text-[var(--fg-1)]">
      <Suspense fallback={null}>
        <SyncComposerDate onChange={setComposerDate} />
        <OpenAstraFromQuery pathname={pathname} onOpen={setAstraConversationOpen} />
      </Suspense>
      <DestinationShell
        onCreate={handleCreate}
        createRefusal={!isOnline && showCreateRefusal ? (
          <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} />
        ) : undefined}
        composer={
          <Composer
            {...chat.composerProps}
            suggestions={resolveComposerDockSuggestions(pathname, chat.composerProps.suggestions)}
            inputId={chat.composerInputId}
            onOpenConversation={() => setAstraConversationOpen(true)}
            conversationLabel={t('todayAstra.openConversation')}
            onSend={chat.composerProps.onSend}
          />
        }
        conversation={(
          <AstraConversation
            chat={chat}
            notice={toastInConversation ? (
              <>
                <UpdateAvailableBanner />
                <AppToastHost />
              </>
            ) : undefined}
          />
        )}
        conversationOpen={astraConversationOpen}
        conversationLabel={t('chat.title')}
        notice={(
          <>
            <CelebrationPanel />
            <UpdateAvailableBanner active={!toastInConversation && pathname !== '/wrapped'} />
            <NotificationDeleteNotice />
            {!toastInConversation && pathname !== '/wrapped' ? <AppToastHost /> : null}
          </>
        )}
      >
        <RouteTransitionShell>
          <div>{children}</div>
        </RouteTransitionShell>
      </DestinationShell>

      <input
        ref={textFileInputRef}
        type="file"
        accept={CHAT_TEXT_FILE_WEB_ACCEPT}
        className="hidden"
        onChange={(event) => void handleTextFileSelect(event)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      <GlobalOverlays
        profile={profile}
        canViewGamification={canViewGamification}
        suppressOnboardingOverlay={shouldSuppressOnboardingOverlay({
          draftHydrated,
          hasPendingOnboardingAnswers,
        })}
        showCalendarPrompt={showCalendarPrompt}
        calendarSheetRef={calendarSheetRef}
        onCalendarPromptOpenChange={handleCalendarPromptOpenChange}
        onCalendarImport={handleCalendarImport}
        onDismissCalendarPrompt={() => closeCalendarSheet(handleDismissCalendarPrompt)}
        showImportPrompt={showImportPrompt}
        importSheetRef={importSheetRef}
        onImportPromptOpenChange={handleImportPromptOpenChange}
        onImportWithAstra={handleImportWithAstra}
        onDismissImportPrompt={() => closeImportSheet(handleDismissImportPrompt)}
      />

      {showCreateModal && (
        <Suspense fallback={null}>
          <PushHabitCreateFromQuery
            pathname={pathname}
            activeView={activeView}
            onNavigated={() => setShowCreateModal(false)}
          />
        </Suspense>
      )}
      <ApiFetchI18nProvider />
    </CommandPaletteBackground>
  )
}

// react-doctor-disable-next-line no-many-boolean-props -- private layout-internal overlay aggregator, not a reusable API; the flags are independent render gates, not a combinatorial surface https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function GlobalOverlays({
  profile,
  canViewGamification,
  suppressOnboardingOverlay,
  showCalendarPrompt,
  calendarSheetRef,
  onCalendarPromptOpenChange,
  onCalendarImport,
  onDismissCalendarPrompt,
  showImportPrompt,
  importSheetRef,
  onImportPromptOpenChange,
  onImportWithAstra,
  onDismissImportPrompt,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
  canViewGamification: boolean
  suppressOnboardingOverlay: boolean
  showCalendarPrompt: boolean
  calendarSheetRef: ReturnType<typeof useSheetHost>['sheetRef']
  onCalendarPromptOpenChange: (open: boolean) => void
  onCalendarImport: () => void
  onDismissCalendarPrompt: () => void
  showImportPrompt: boolean
  importSheetRef: ReturnType<typeof useSheetHost>['sheetRef']
  onImportPromptOpenChange: (open: boolean) => void
  onImportWithAstra: () => void
  onDismissImportPrompt: () => void
}>) {
  const t = useTranslations()
  const gamification = useGamificationProfile(canViewGamification)
  const { clearLevelUp, leveledUp, newLevel } = gamification

  useEffect(() => {
    if (!leveledUp || newLevel === null) return
    useUIStore.getState().enqueueCelebration('level-up', { level: newLevel })
    clearLevelUp()
  }, [clearLevelUp, leveledUp, newLevel])
  const armReferralPrompt = useReferralPromptStore((s) => s.armReferralPrompt)
  const armMilestoneSharePrompt = useReferralPromptStore(
    (s) => s.armMilestoneSharePrompt,
  )
  const armConsentPrompt = useReferralPromptStore((s) => s.armConsentPrompt)
  const showPendingPro = useOnboardingProPending()
  const completionQueued = useOnboardingCompletionQueue()
  const retainedOnboarding = useRetainedOnboardingGuard(
    profile,
    suppressOnboardingOverlay || completionQueued,
    useOnboardingDraftStore((state) => state.pushRegistrationFailed),
  )

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const showRetainedOnboarding = isAuthenticated && (retainedOnboarding || showPendingPro)

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

  useEffect(() => {
    if (gamification.leveledUp && gamification.newLevel) {
      armReferralPrompt(getReferralLevelMilestone(gamification.newLevel))
    }
  }, [gamification.leveledUp, gamification.newLevel, armReferralPrompt])

  useEffect(() => {
    const crossedStreak = gamification.crossedStreakMilestones.at(-1) ?? null
    const shareableAchievement = gamification.newAchievements.find(isShareableAchievement)
    let candidateKey: string | null = null
    if (crossedStreak !== null) {
      candidateKey = getMilestoneShareStreakKey(crossedStreak)
    } else if (shareableAchievement) {
      candidateKey = getMilestoneShareAchievementKey(shareableAchievement.id)
    }
    if (candidateKey) {
      armMilestoneSharePrompt(candidateKey)
    }
  }, [
    gamification.crossedStreakMilestones,
    gamification.newAchievements,
    armMilestoneSharePrompt,
  ])

  return (
    <div className="contents">
      <ExpiryWarning />
      {!showRetainedOnboarding ? <TrialExpiredModal /> : null}
      {showRetainedOnboarding && <RetainedOnboardingOverlay finalStepOnly={showPendingPro} />}
      {profile?.hasCompletedOnboarding && !showRetainedOnboarding && <MarketingConsentPrompt />}
      {profile?.hasCompletedOnboarding && !showRetainedOnboarding && <ReferralPrompt />}
      {profile?.hasCompletedOnboarding && !showRetainedOnboarding && <MilestoneSharePrompt />}
      {showCalendarPrompt && !showRetainedOnboarding ? (<Sheet
        ref={calendarSheetRef}
        open
        onClose={() => (onCalendarPromptOpenChange)(false)}
        title={t('onboarding.wizard.calendarTitle')}
        actions={(
          <ActionRow>
            <PromptQuietAction onClick={onDismissCalendarPrompt}>
              {t('common.later')}
            </PromptQuietAction>
            <PillButton size="sm" onClick={onCalendarImport}>
              {t('onboarding.wizard.calendarButton')}
            </PillButton>
          </ActionRow>
        )}
      >
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.calendarDescription')}
          </p>
        </div>
      </Sheet>) : null}
      {showImportPrompt && !showRetainedOnboarding ? (<Sheet
        ref={importSheetRef}
        open
        onClose={() => (onImportPromptOpenChange)(false)}
        title={t('onboarding.wizard.importTitle')}
        actions={(
          <ActionRow>
            <PromptQuietAction onClick={onDismissImportPrompt}>
              {t('onboarding.wizard.importNotNow')}
            </PromptQuietAction>
            {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
            <PillButton size="sm" onClick={onImportWithAstra}>
              {t('onboarding.wizard.importButton')}
            </PillButton>
          </ActionRow>
        )}
      >
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.importDescription')}
          </p>
        </div>
      </Sheet>) : null}
    </div>
  )
}
