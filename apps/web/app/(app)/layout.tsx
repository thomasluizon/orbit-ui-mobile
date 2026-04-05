'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarDays } from 'lucide-react'
import { Providers } from '@/lib/providers'
import { BottomNav } from '@/components/navigation/bottom-nav'
import { TrialBanner } from '@/components/ui/trial-banner'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { PushPrompt } from '@/components/ui/push-prompt'
import { AppOverlay } from '@/components/ui/app-overlay'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { StreakFreezeCelebration } from '@/components/gamification/streak-freeze-celebration'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useTotalHabitCount } from '@/hooks/use-habits'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'
import { getSupabaseClient } from '@/lib/supabase'
import { dismissCalendarImport } from '@/app/actions/profile'

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

function AppLayoutContent({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const totalHabitCount = useTotalHabitCount()
  const gamification = useGamificationProfile()

  const activeView = useUIStore((s) => s.activeView)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)

  // Streak freeze ref
  const streakFreezeRef = useRef<{ show: () => void }>(null)

  // Google Calendar import prompt state
  const [showCalendarPrompt, setShowCalendarPrompt] = useState(false)

  useEffect(() => {
    if (
      profile &&
      profile.hasCompletedOnboarding &&
      !profile.hasImportedCalendar
    ) {
      setShowCalendarPrompt(true)
    }
  }, [profile])

  // ---------------------------------------------------------------------------
  // handleCreate -- mirrors Nuxt default.vue logic
  // ---------------------------------------------------------------------------
  const handleCreate = useCallback(() => {
    if (activeView === 'goals') {
      setShowCreateGoalModal(true)
      return
    }
    if (!hasProAccess && totalHabitCount >= 10) {
      router.push('/upgrade')
      return
    }
    setShowCreateModal(true)
  }, [activeView, hasProAccess, totalHabitCount, router, setShowCreateModal, setShowCreateGoalModal])

  // ---------------------------------------------------------------------------
  // Calendar import prompt handlers
  // ---------------------------------------------------------------------------
  const handleDismissCalendarPrompt = useCallback(() => {
    setShowCalendarPrompt(false)
    dismissCalendarImport().catch(() => {})
  }, [])

  const handleCalendarImport = useCallback(async () => {
    setShowCalendarPrompt(false)
    dismissCalendarImport().catch(() => {})

    if (profile?.hasGoogleConnection) {
      router.push('/calendar-sync')
      return
    }

    // No Google tokens yet -- trigger OAuth, redirect to calendar-sync after
    const supabase = getSupabaseClient()
    const redirectTo = `${globalThis.location.origin}/auth-callback`
    sessionStorage.setItem('auth_return_url', '/calendar-sync')

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: { access_type: 'offline' },
      },
    })
  }, [profile?.hasGoogleConnection, router])

  // Track when calendar prompt is closed via overlay X button
  const handleCalendarPromptOpenChange = useCallback(
    (open: boolean) => {
      if (!open && showCalendarPrompt) {
        handleDismissCalendarPrompt()
      }
    },
    [showCalendarPrompt, handleDismissCalendarPrompt],
  )

  return (
    <div className="min-h-dvh bg-background text-text-primary pb-28 pt-[var(--safe-top)] ambient-glow">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
      >
        {t('nav.skipToContent')}
      </a>

      {/* Main content - full width mobile, max-w on desktop */}
      <main
        id="main-content"
        className="mx-auto max-w-[var(--app-max-w)] px-[var(--app-px)]"
      >
        <TrialBanner />
        <div>{children}</div>
      </main>

      {/* Bottom navigation */}
      <BottomNav onCreate={handleCreate} />

      <GlobalOverlays
        profile={profile}
        hasProAccess={hasProAccess}
        gamification={gamification}
        streakFreezeRef={streakFreezeRef}
        showCalendarPrompt={showCalendarPrompt}
        onCalendarPromptOpenChange={handleCalendarPromptOpenChange}
        onCalendarImport={handleCalendarImport}
        onDismissCalendarPrompt={handleDismissCalendarPrompt}
      />
    </div>
  )
}

// Extracted to its own component so conditional children don't trigger React key warnings
// in the parent AppLayoutContent
function GlobalOverlays({
  profile,
  hasProAccess,
  gamification,
  streakFreezeRef,
  showCalendarPrompt,
  onCalendarPromptOpenChange,
  onCalendarImport,
  onDismissCalendarPrompt,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
  hasProAccess: boolean
  gamification: ReturnType<typeof useGamificationProfile>
  streakFreezeRef: React.RefObject<{ show: () => void } | null>
  showCalendarPrompt: boolean
  onCalendarPromptOpenChange: (open: boolean) => void
  onCalendarImport: () => void
  onDismissCalendarPrompt: () => void
}>) {
  const t = useTranslations()

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
          onClear={() => {}}
        />
      )}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      <AppOverlay
        open={showCalendarPrompt}
        onOpenChange={onCalendarPromptOpenChange}
        title={t('onboarding.wizard.calendarTitle')}
      >
        <div className="flex flex-col items-center text-center gap-5 py-2">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarDays className="size-8 text-primary" />
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('onboarding.wizard.calendarDescription')}
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)]"
              onClick={onCalendarImport}
            >
              {t('onboarding.wizard.calendarButton')}
            </button>
            <button
              className="w-full py-3 text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
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
