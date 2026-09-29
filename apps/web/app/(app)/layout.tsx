'use client'

import { useEffect, useCallback, useId, Suspense } from 'react'
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
import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { RetainedOnboardingOverlay } from '@/components/onboarding/retained-onboarding-overlay'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
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
import { TodayProvider } from './today-provider'
import {
  isCalendarPromptCriteriaMet,
  isImportPromptCriteriaMet,
  shouldSuppressOnboardingOverlay,
} from './onboarding-overlay-state'
import { ApiFetchI18nProvider } from '@/lib/api-fetch-i18n-provider'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { formatAPIDate, isShareableAchievement } from '@orbit/shared/utils'
import { AccountEventConnection } from '@/lib/account-event-connection'

const CreateHabitModal = dynamic(() =>
  import('@/components/habits/create-habit-modal').then((module) => module.CreateHabitModal),
)

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
  if (pathname === '/about' && !isAuthenticated) return <>{children}<AppToastHost placement="page" /></>
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

function CreateHabitModalFromQuery({ pathname, activeView, onOpenChange }: Readonly<{
  pathname: string
  activeView: string
  onOpenChange: (open: boolean) => void
}>) {
  const searchParams = useSearchParams()
  return (
    <CreateHabitModal
      open
      onOpenChange={onOpenChange}
      initialDate={
        activeView === 'today' && pathname === '/'
          ? getSelectedDateFromParam(searchParams.get('date'))
          : null
      }
    />
  )
}

function AppLayoutContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const { profile, patchProfile } = useProfile()
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
  const setAstraConversationOpen = useUIStore((s) => s.setAstraConversationOpen)
  const {
    fileInputRef,
    textFileInputRef,
    handleFileSelect,
    handleTextFileSelect,
    ...chat
  } = useChatComposer()

  const [showCalendarPrompt, setShowCalendarPrompt] = useAccountScopedState(false)
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
  }, [isOnline, profile, hasProAccess, habitCountLoaded, totalHabitCount, router, setShowCreateModal, setShowCreateRefusal])

  const handleDismissCalendarPrompt = useCallback(() => {
    setShowCalendarPrompt(false)
    dismissCalendarImport(getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
    })
  }, [setShowCalendarPrompt, showPersistentError, t])


  const handleCalendarImport = useCallback(() => {
    setShowCalendarPrompt(false)
    dismissCalendarImport(getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
    })
    setRouteTransitionIntent('forward')
    router.push('/calendar-sync')
  }, [router, setShowCalendarPrompt, showPersistentError, t])


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
    setShowImportPrompt(false)
    dismissImportPrompt(getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
    })
    patchProfile({ hasSeenImportPrompt: true })
    if ('localStorage' in globalThis) {
      globalThis.localStorage.setItem(
        CHAT_DRAFT_STORAGE_KEY,
        t('onboarding.flow.meetAstra.importPrompt'),
      )
    }
    setRouteTransitionIntent('forward')
    setAstraConversationOpen(true)
  }, [patchProfile, setAstraConversationOpen, setShowImportPrompt, showPersistentError, t])


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
            inputId={chat.composerInputId}
            onOpenConversation={() => setAstraConversationOpen(true)}
            conversationLabel={t('todayAstra.openConversation')}
            onSend={chat.composerProps.onSend}
          />
        }
        conversation={<AstraConversation chat={chat} />}
        conversationOpen={astraConversationOpen}
        conversationLabel={t('todayAstra.openConversation')}
        notice={(
          <>
            <CelebrationPanel />
            <UpdateAvailableBanner />
            <NotificationDeleteNotice />
            <AppToastHost />
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
        onCalendarPromptOpenChange={handleCalendarPromptOpenChange}
        onCalendarImport={handleCalendarImport}
        onDismissCalendarPrompt={handleDismissCalendarPrompt}
        showImportPrompt={showImportPrompt}
        onImportPromptOpenChange={handleImportPromptOpenChange}
        onImportWithAstra={handleImportWithAstra}
        onDismissImportPrompt={handleDismissImportPrompt}
      />

      {showCreateModal && (
        <Suspense fallback={null}>
          <CreateHabitModalFromQuery
            pathname={pathname}
            activeView={activeView}
            onOpenChange={setShowCreateModal}
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
  onCalendarPromptOpenChange,
  onCalendarImport,
  onDismissCalendarPrompt,
  showImportPrompt,
  onImportPromptOpenChange,
  onImportWithAstra,
  onDismissImportPrompt,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
  canViewGamification: boolean
  suppressOnboardingOverlay: boolean
  showCalendarPrompt: boolean
  onCalendarPromptOpenChange: (open: boolean) => void
  onCalendarImport: () => void
  onDismissCalendarPrompt: () => void
  showImportPrompt: boolean
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
  const showRetainedOnboarding = useRetainedOnboardingGuard(
    profile,
    suppressOnboardingOverlay,
    useOnboardingDraftStore((state) => state.pushRegistrationFailed),
  )

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
      {showRetainedOnboarding && <RetainedOnboardingOverlay />}
      {profile?.hasCompletedOnboarding && !showRetainedOnboarding && <MarketingConsentPrompt />}
      {profile?.hasCompletedOnboarding && !showRetainedOnboarding && <ReferralPrompt />}
      {profile?.hasCompletedOnboarding && !showRetainedOnboarding && <MilestoneSharePrompt />}
      {showCalendarPrompt && !showRetainedOnboarding ? (<Sheet
        open
        onClose={() => (onCalendarPromptOpenChange)(false)}
        title={t('onboarding.wizard.calendarTitle')}
      >
        <div className="flex flex-col items-center text-center gap-6 py-2">
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.calendarDescription')}
          </p>
          <div className="flex flex-col gap-3 w-full">
            <PillButton  onClick={onCalendarImport} >
              {t('onboarding.wizard.calendarButton')}
            </PillButton>
            <button
              type="button"
              className="w-full py-3 text-[var(--fg-2)] text-sm font-medium hover:text-[var(--fg-1)] transition-colors"
              onClick={onDismissCalendarPrompt}
            >
              {t('common.later')}
            </button>
          </div>
        </div>
      </Sheet>) : null}
      {showImportPrompt && !showRetainedOnboarding ? (<Sheet
        open
        onClose={() => (onImportPromptOpenChange)(false)}
        title={t('onboarding.wizard.importTitle')}
      >
        <div className="flex flex-col items-center text-center gap-6 py-2">
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.importDescription')}
          </p>
          <div className="flex flex-col gap-3 w-full">
            {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
            <PillButton  onClick={onImportWithAstra} >
              {t('onboarding.wizard.importButton')}
            </PillButton>
            <button
              type="button"
              className="w-full py-3 text-[var(--fg-2)] text-sm font-medium hover:text-[var(--fg-1)] transition-colors"
              onClick={onDismissImportPrompt}
            >
              {t('onboarding.wizard.importNotNow')}
            </button>
          </div>
        </div>
      </Sheet>) : null}
    </div>
  )
}
