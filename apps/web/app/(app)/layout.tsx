'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarDays } from 'lucide-react'
import { Providers } from '@/lib/providers'
import { WebNav } from '@/components/navigation/web-nav'
import type { BottomTab } from '@/components/navigation/bottom-tab-bar'
import { TrialBanner } from '@/components/ui/trial-banner'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { PushPrompt } from '@/components/ui/push-prompt'
import { AppOverlay } from '@/components/ui/app-overlay'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { CreateGoalModal } from '@/components/goals/create-goal-modal'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { StreakFreezeCelebration } from '@/components/gamification/streak-freeze-celebration'
import { useProfile } from '@/hooks/use-profile'
import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'
import { useAuthStore } from '@/stores/auth-store'
import { useTotalHabitCount } from '@/hooks/use-habits'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'
import { useTourStore } from '@/stores/tour-store'
import { getSupabaseClient } from '@/lib/supabase'
import { dismissCalendarImport } from '@/app/actions/profile'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { RouteTransitionShell } from '@/components/motion/route-transition-shell'
import { ApiFetchI18nProvider } from '@/lib/api-fetch-i18n-provider'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { buildGoogleCalendarOAuthOptions } from '@orbit/shared/utils'

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Providers>
      <AppLayoutContent>{children}</AppLayoutContent>
    </Providers>
  )
}

function pathnameToTab(pathname: string): BottomTab {
  if (pathname === '/' || pathname === '/today') return 'today'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname === '/calendar' || pathname.startsWith('/calendar/')) return 'calendar'
  return 'profile'
}

function AppLayoutContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const pathname = usePathname()
  const { profile } = useProfile()
  useTimezoneAutoSync(profile)
  const hasProAccess = profile?.hasProAccess ?? false
  const totalHabitCount = useTotalHabitCount()

  useEffect(() => {
    const cleanup = useAuthStore.getState().startExpiryMonitor()
    return cleanup
  }, [])
  const activeView = useUIStore((s) => s.activeView)
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const showCreateGoalModal = useUIStore((s) => s.showCreateGoalModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)
  const selectedDate = useUIStore((s) => s.selectedDate)

  const streakFreezeRef = useRef<{ show: () => void }>(null)

  const [showCalendarPrompt, setShowCalendarPrompt] = useState(false)

  // Auto-trigger feature tour for users who completed onboarding but haven't seen the tour
  const tourStarted = useRef(false)
  useEffect(() => {
    if (
      profile &&
      profile.hasCompletedOnboarding &&
      !profile.hasCompletedTour &&
      !tourStarted.current &&
      !useTourStore.getState().isActive
    ) {
      tourStarted.current = true
      setTimeout(() => useTourStore.getState().startFullTour(), 500)
    }
  }, [profile])

  // Show the calendar import prompt once the profile meets the criteria.
  // "Adjusting state when a prop changes" pattern: detect the criteria
  // transitioning from false -> true during render.
  const calendarPromptCriteriaMet = !!(
    profile &&
    profile.hasCompletedOnboarding &&
    profile.hasCompletedTour &&
    !profile.hasImportedCalendar
  )
  const [previousCriteriaMet, setPreviousCriteriaMet] = useState(calendarPromptCriteriaMet)
  if (calendarPromptCriteriaMet !== previousCriteriaMet) {
    setPreviousCriteriaMet(calendarPromptCriteriaMet)
    if (calendarPromptCriteriaMet) setShowCalendarPrompt(true)
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

  const handleCalendarImport = useCallback(async () => {
    setShowCalendarPrompt(false)
    dismissCalendarImport().catch(() => {})

    if (profile?.hasGoogleConnection) {
      setRouteTransitionIntent('forward')
      router.push('/calendar-sync')
      return
    }

    // No Google tokens yet -- trigger OAuth, redirect to calendar-sync after
    const supabase = getSupabaseClient()
    const redirectTo = `${globalThis.location.origin}/auth-callback`
    sessionStorage.setItem('auth_return_url', '/calendar-sync')

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: buildGoogleCalendarOAuthOptions({ redirectTo, forceConsent: true }),
    })
  }, [profile?.hasGoogleConnection, router])

  const handleCalendarPromptOpenChange = useCallback(
    (open: boolean) => {
      if (!open && showCalendarPrompt) {
        handleDismissCalendarPrompt()
      }
    },
    [showCalendarPrompt, handleDismissCalendarPrompt],
  )

  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden bg-[var(--bg)] text-[var(--fg-1)] pb-28 pt-[var(--safe-top)] ambient-glow">
      <main
        className="relative z-10 mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)]"
      >
        <TrialBanner />
        <RouteTransitionShell>
          <div>{children}</div>
        </RouteTransitionShell>
      </main>

      {/* Bottom-fixed nav. Bar bg + hairline extend full-width so the bar reads as a system bezel,
          while the tabs/FAB stay phone-width centered via the inner max-w wrapper. */}
      <div
        data-bottom-nav=""
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{
          paddingBottom: 'var(--safe-bottom)',
          background: 'var(--bg)',
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <div className="max-w-[var(--app-max-w)] mx-auto">
          <WebNav
            active={pathnameToTab(pathname ?? '/')}
            onTab={(id) => {
              if (id === 'today') router.push('/')
              else router.push(`/${id}`)
            }}
            onFab={handleCreate}
          />
        </div>
      </div>

      <GlobalOverlays
        profile={profile}
        hasProAccess={hasProAccess}
        streakFreezeRef={streakFreezeRef}
        showCalendarPrompt={showCalendarPrompt}
        onCalendarPromptOpenChange={handleCalendarPromptOpenChange}
        onCalendarImport={handleCalendarImport}
        onDismissCalendarPrompt={handleDismissCalendarPrompt}
      />

      {showCreateModal && (
        <CreateHabitModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          initialDate={activeView === 'today' && pathname === '/' ? selectedDate : null}
        />
      )}
      {showCreateGoalModal && (
        <CreateGoalModal
          open={showCreateGoalModal}
          onOpenChange={setShowCreateGoalModal}
        />
      )}

      <ApiFetchI18nProvider />
      <TourProvider />
      <TourOverlay />
    </div>
  )
}

// Extracted to its own component so conditional children don't trigger React key warnings
// in the parent AppLayoutContent
function GlobalOverlays({
  profile,
  hasProAccess,
  streakFreezeRef,
  showCalendarPrompt,
  onCalendarPromptOpenChange,
  onCalendarImport,
  onDismissCalendarPrompt,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
  hasProAccess: boolean
  streakFreezeRef: React.RefObject<{ show: () => void } | null>
  showCalendarPrompt: boolean
  onCalendarPromptOpenChange: (open: boolean) => void
  onCalendarImport: () => void
  onDismissCalendarPrompt: () => void
}>) {
  const t = useTranslations()
  const gamification = useGamificationProfile(hasProAccess)

  return (
    <div className="contents">
      <TrialExpiredModal />
      {profile?.hasCompletedOnboarding && <PushPrompt />}
      {profile && !profile.hasCompletedOnboarding && <OnboardingFlow />}
      <StreakCelebration />
      <AllDoneCelebration />
      <GoalCompletedCelebration />
      <WelcomeBackToast />
      {hasProAccess && <AchievementToast />}
      {hasProAccess && (
        <LevelUpOverlay
          leveledUp={gamification.leveledUp}
          newLevel={gamification.newLevel}
          onClear={gamification.clearLevelUp}
        />
      )}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      <AppOverlay
        open={showCalendarPrompt}
        onOpenChange={onCalendarPromptOpenChange}
        title={t('onboarding.wizard.calendarTitle')}
      >
        <div className="flex flex-col items-center text-center gap-5 py-2">
          <div className="size-16 rounded-full bg-[var(--bg-sunk)] flex items-center justify-center">
            <CalendarDays className="size-8 text-[var(--primary)]" />
          </div>
          <p className="text-sm text-[var(--fg-2)] leading-relaxed">
            {t('onboarding.wizard.calendarDescription')}
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              className="w-full py-3.5 rounded-[12px] bg-[var(--primary)] text-white font-bold text-sm text-center transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-[var(--primary-pressed)] active:scale-[0.98]"
              onClick={onCalendarImport}
            >
              {t('onboarding.wizard.calendarButton')}
            </button>
            <button
              className="w-full py-3 text-[var(--fg-2)] text-sm font-medium hover:text-[var(--fg-1)] transition-colors"
              onClick={onDismissCalendarPrompt}
            >
              {t('common.later')}
            </button>
          </div>
        </div>
      </AppOverlay>
    </div>
  )
}
