'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Providers } from '@/lib/providers'
import { WebNav } from '@/components/navigation/web-nav'
import { AppShell } from '@/components/shell/app-shell'
import type { BottomTab } from '@/components/navigation/bottom-tab-bar'
import { TrialBanner } from '@/components/ui/trial-banner'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { BackToTop } from '@/components/ui/back-to-top'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { PushPrompt } from '@/components/ui/push-prompt'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { CreateGoalModal } from '@/components/goals/create-goal-modal'
import { RetainedOnboardingOverlay } from '@/components/onboarding/retained-onboarding-overlay'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { StreakFreezeCelebration } from '@/components/gamification/streak-freeze-celebration'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useProfile } from '@/hooks/use-profile'
import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'
import { useAuthStore } from '@/stores/auth-store'
import { useTotalHabitCount } from '@/hooks/use-habits'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import {
  getReferralLevelMilestone,
  getMilestoneShareAchievementKey,
  getMilestoneShareStreakKey,
  MARKETING_CONSENT_MILESTONE_KEY,
} from '@orbit/shared/stores'
import { dismissCalendarImport } from '@/app/actions/calendar'
import { dismissImportPrompt } from '@/app/actions/onboarding'
import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'
import {
  useOnboardingDraftHydrated,
  useOnboardingHasPendingAnswers,
} from '@/stores/onboarding-draft-store'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { TodayProvider } from './today-provider'
import {
  isCalendarPromptCriteriaMet,
  isImportPromptCriteriaMet,
  shouldSuppressOnboardingOverlay,
} from './onboarding-overlay-state'
import { ApiFetchI18nProvider } from '@/lib/api-fetch-i18n-provider'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { formatAPIDate, isShareableAchievement } from '@orbit/shared/utils'

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Providers>
      <TodayProvider>
        <AppLayoutContent>{children}</AppLayoutContent>
      </TodayProvider>
    </Providers>
  )
}

function pathnameToTab(pathname: string): BottomTab {
  if (pathname === '/' || pathname === '/today') return 'today'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname === '/calendar' || pathname.startsWith('/calendar/')) return 'calendar'
  return 'profile'
}

function getSelectedDateFromParam(dateParam: string | null): string {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
  return formatAPIDate(new Date())
}

function AppLayoutContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const { profile, patchProfile } = useProfile()
  useTimezoneAutoSync(profile)
  useOnboardingFlush()
  const draftHydrated = useOnboardingDraftHydrated()
  const hasPendingOnboardingAnswers = useOnboardingHasPendingAnswers()
  const hasProAccess = profile?.hasProAccess ?? false
  const canViewGamification = profile?.canViewGamification ?? false
  const totalHabitCount = useTotalHabitCount()

  useEffect(() => {
    const cleanup = useAuthStore.getState().startExpiryMonitor()
    return cleanup
  }, [])

  useEffect(() => {
    for (const tabRoute of ['/', '/chat', '/calendar', '/profile']) {
      router.prefetch(tabRoute)
    }
  }, [router])
  const activeView = useUIStore((s) => s.activeView)
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const showCreateGoalModal = useUIStore((s) => s.showCreateGoalModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)

  const streakFreezeRef = useRef<{ show: () => void }>(null)

  const [showCalendarPrompt, setShowCalendarPrompt] = useState(false)

  const calendarPromptCriteriaMet = isCalendarPromptCriteriaMet(profile, pathname)
  const [previousCriteriaMet, setPreviousCriteriaMet] = useState(calendarPromptCriteriaMet)
  if (calendarPromptCriteriaMet !== previousCriteriaMet) {
    setPreviousCriteriaMet(calendarPromptCriteriaMet)
    if (calendarPromptCriteriaMet) setShowCalendarPrompt(true)
  }

  const [showImportPrompt, setShowImportPrompt] = useState(false)

  const importPromptCriteriaMet = isImportPromptCriteriaMet(profile, {
    calendarPromptCriteriaMet,
    showCalendarPrompt,
    hasPendingOnboardingAnswers,
  })
  const [previousImportCriteriaMet, setPreviousImportCriteriaMet] = useState(importPromptCriteriaMet)
  if (importPromptCriteriaMet !== previousImportCriteriaMet) {
    setPreviousImportCriteriaMet(importPromptCriteriaMet)
    if (importPromptCriteriaMet) setShowImportPrompt(true)
  }

  const handleCreate = useCallback(() => {
    if (activeView === 'goals') {
      if (!hasProAccess) {
        setRouteTransitionIntent('forward')
        router.push('/upgrade')
        return
      }
      setShowCreateGoalModal(true)
      return
    }
    if (!hasProAccess && totalHabitCount >= 10) {
      setRouteTransitionIntent('forward')
      router.push('/upgrade')
      return
    }
    setShowCreateModal(true)
  }, [activeView, hasProAccess, totalHabitCount, router, setShowCreateModal, setShowCreateGoalModal])

  const handleDismissCalendarPrompt = useCallback(() => {
    setShowCalendarPrompt(false)
    dismissCalendarImport().catch(() => {})
  }, [])

  const handleCalendarImport = useCallback(() => {
    setShowCalendarPrompt(false)
    dismissCalendarImport().catch(() => {})
    setRouteTransitionIntent('forward')
    router.push('/calendar-sync')
  }, [router])

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
    dismissImportPrompt().catch(() => {})
    patchProfile({ hasSeenImportPrompt: true })
  }, [patchProfile])

  const handleImportWithAstra = useCallback(() => {
    setShowImportPrompt(false)
    dismissImportPrompt().catch(() => {})
    patchProfile({ hasSeenImportPrompt: true })
    if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(
        CHAT_DRAFT_STORAGE_KEY,
        t('onboarding.flow.meetAstra.importPrompt'),
      )
    }
    setRouteTransitionIntent('forward')
    router.push('/chat')
  }, [patchProfile, router, t])

  const handleImportPromptOpenChange = useCallback(
    (open: boolean) => {
      if (!open && showImportPrompt) {
        handleDismissImportPrompt()
      }
    },
    [showImportPrompt, handleDismissImportPrompt],
  )

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-[var(--bg)] text-[var(--fg-1)] pb-28 pt-[var(--safe-top)] md:pb-0">
      <AppShell onCreate={handleCreate}>
        <TrialBanner />
        <UpdateAvailableBanner />
        <RouteTransitionShell>
          <div>{children}</div>
        </RouteTransitionShell>
      </AppShell>

      <div
        data-bottom-nav=""
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
        style={{
          paddingBottom: 'var(--safe-bottom)',
          background: 'var(--bg)',
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <div className="max-w-[var(--app-max-w)] mx-auto">
          <WebNav
            active={pathnameToTab(pathname)}
            onTab={(id) => {
              if (id === 'today') router.push('/')
              else router.push(`/${id}`)
            }}
            onFab={handleCreate}
          />
        </div>
      </div>

      <BackToTop />

      <GlobalOverlays
        profile={profile}
        hasProAccess={hasProAccess}
        canViewGamification={canViewGamification}
        streakFreezeRef={streakFreezeRef}
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
        <CreateHabitModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          initialDate={
            activeView === 'today' && pathname === '/'
              ? getSelectedDateFromParam(searchParams.get('date'))
              : null
          }
        />
      )}
      <CreateGoalModal
        open={showCreateGoalModal}
        onOpenChange={setShowCreateGoalModal}
      />

      <ApiFetchI18nProvider />
      <TourProvider />
      <TourOverlay />
    </div>
  )
}

function GlobalOverlays({
  profile,
  hasProAccess,
  canViewGamification,
  streakFreezeRef,
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
  hasProAccess: boolean
  canViewGamification: boolean
  streakFreezeRef: React.RefObject<{ show: () => void } | null>
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
  const armReferralPrompt = useReferralPromptStore((s) => s.armReferralPrompt)
  const armMilestoneSharePrompt = useReferralPromptStore(
    (s) => s.armMilestoneSharePrompt,
  )
  const armConsentPrompt = useReferralPromptStore((s) => s.armConsentPrompt)
  const showRetainedOnboarding = useRetainedOnboardingGuard(
    profile,
    suppressOnboardingOverlay,
  )

  useEffect(() => {
    if (
      profile?.hasCompletedOnboarding &&
      profile.hasCompletedTour &&
      profile.hasSeenImportPrompt &&
      profile.marketingEmailConsent === null
    ) {
      armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    }
  }, [
    profile?.hasCompletedOnboarding,
    profile?.hasCompletedTour,
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
      <TrialExpiredModal />
      {profile?.hasCompletedOnboarding && <PushPrompt />}
      {showRetainedOnboarding && <RetainedOnboardingOverlay />}
      <StreakCelebration />
      <AllDoneCelebration />
      <GoalCompletedCelebration />
      <WelcomeBackToast />
      {hasProAccess && <AchievementToast />}
      {canViewGamification && (
        <LevelUpOverlay
          leveledUp={gamification.leveledUp}
          newLevel={gamification.newLevel}
          onClear={gamification.clearLevelUp}
        />
      )}
      {profile?.hasCompletedOnboarding && <MarketingConsentPrompt />}
      {profile?.hasCompletedOnboarding && <ReferralPrompt />}
      {profile?.hasCompletedOnboarding && <MilestoneSharePrompt />}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      <AppOverlay
        open={showCalendarPrompt}
        onOpenChange={onCalendarPromptOpenChange}
        title={t('onboarding.wizard.calendarTitle')}
      >
        <div className="flex flex-col items-center text-center gap-5 py-2">
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.calendarDescription')}
          </p>
          <div className="flex flex-col gap-3 w-full">
            <PillButton fullWidth onClick={onCalendarImport} className="md:self-center">
              {t('onboarding.wizard.calendarButton')}
            </PillButton>
            <button
              className="w-full py-3 text-[var(--fg-2)] text-sm font-medium hover:text-[var(--fg-1)] transition-colors"
              onClick={onDismissCalendarPrompt}
            >
              {t('common.later')}
            </button>
          </div>
        </div>
      </AppOverlay>
      <AppOverlay
        open={showImportPrompt}
        onOpenChange={onImportPromptOpenChange}
        title={t('onboarding.wizard.importTitle')}
      >
        <div className="flex flex-col items-center text-center gap-5 py-2">
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.importDescription')}
          </p>
          <div className="flex flex-col gap-3 w-full">
            <PillButton fullWidth onClick={onImportWithAstra} className="md:self-center">
              {t('onboarding.wizard.importButton')}
            </PillButton>
            <button
              className="w-full py-3 text-[var(--fg-2)] text-sm font-medium hover:text-[var(--fg-1)] transition-colors"
              onClick={onDismissImportPrompt}
            >
              {t('onboarding.wizard.importNotNow')}
            </button>
          </div>
        </div>
      </AppOverlay>
    </div>
  )
}
