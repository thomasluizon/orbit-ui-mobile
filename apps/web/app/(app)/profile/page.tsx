'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import {
  Settings,
  Sparkles,
  Info,
  Wrench,
  LogOut,
  RotateCcw,
  Trash2,
  ChevronRight,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ProfileStreakCard } from '@/components/gamification/profile-streak-card'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { SubscriptionCard } from './_components/subscription-card'
import { FreshStartModal } from './_components/fresh-start-modal'
import { DeleteAccountModal } from './_components/delete-account-modal'

export default function ProfilePage() {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile, isLoading, error } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)
  const { profile: gamificationProfile } = useGamificationProfile()

  // Handle subscription success redirect -- refresh profile to pick up new plan
  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    }
  }, [searchParams, queryClient])

  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  return (
    <div className="pb-8">
      {/* Header */}
      <header className="pt-8 pb-6 flex items-center justify-between">
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('profile.title')}
        </h1>
        <ThemeToggle />
      </header>

      {/* Store error */}
      {error && (
        <p className="mb-4 text-sm text-red-400 text-center">
          {error instanceof Error ? error.message : t('errors.loadProfile')}
        </p>
      )}

      <div className="space-y-4">
        {/* ==================== ACCOUNT ==================== */}
        <h2 className="form-label pt-2">{t('profile.sections.account')}</h2>

        {/* User info card */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-6 w-48 bg-surface-elevated rounded animate-pulse" />
              <div className="h-4 w-64 bg-surface-elevated rounded animate-pulse" />
            </div>
          ) : (
            <div>
              <p className="text-lg font-bold text-text-primary">{profile?.name}</p>
              <p className="text-sm text-text-secondary">{profile?.email}</p>
            </div>
          )}
        </div>

        {/* Streak display */}
        <ProfileStreakCard />

        {/* Subscription */}
        <SubscriptionCard
          profile={profile}
          trialDaysLeft={trialDaysLeft}
          trialExpired={trialExpired}
        />

        {/* ==================== NAVIGATION CARDS ==================== */}

        {/* Preferences */}
        <Link
          href="/preferences"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <Settings className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('profile.sections.preferences')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.sections.preferencesHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* AI Features */}
        <Link
          href="/ai-settings"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('profile.sections.aiFeatures')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.sections.aiFeaturesHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* ==================== FEATURES ==================== */}
        <h2 className="form-label pt-2">{t('profile.sections.features')}</h2>

        {/* Retrospective */}
        <Link
          href="/retrospective"
          className="w-full bg-primary/10 border border-primary/20 rounded-[var(--radius-xl)] p-5 flex items-center gap-4 hover:bg-primary/15 hover:border-primary/30 transition-all duration-200 group text-left shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/20 rounded-[var(--radius-lg)] p-3 group-hover:bg-primary/30 transition-colors">
            <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-text-primary">{t('profile.retrospectiveTitle')}</p>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{t('common.proBadge')}</span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.retrospectiveHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
        </Link>

        {/* Achievements & Level */}
        <Link
          href="/achievements"
          className="w-full bg-primary/10 border border-primary/20 rounded-[var(--radius-xl)] p-5 flex items-center gap-4 hover:bg-primary/15 hover:border-primary/30 transition-all duration-200 group text-left shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/20 rounded-[var(--radius-lg)] p-3 group-hover:bg-primary/30 transition-colors">
            <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 8 9 8" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 15 8 15 8" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-text-primary">{t('gamification.profileCard.title')}</p>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{t('common.proBadge')}</span>
            </div>
            {profile?.hasProAccess && gamificationProfile ? (
              <p className="text-xs text-text-secondary mt-0.5">
                {t('gamification.profileCard.level', { level: gamificationProfile.level })}
                {' \u00B7 '}
                {t('gamification.profileCard.totalXp', { total: gamificationProfile.totalXp })}
              </p>
            ) : (
              <p className="text-xs text-text-secondary mt-0.5">{t('gamification.profileCard.hint')}</p>
            )}
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
        </Link>

        {/* Google Calendar Sync */}
        <Link
          href="/calendar-sync"
          className="w-full bg-primary/10 border border-primary/20 rounded-[var(--radius-xl)] p-5 flex items-center gap-4 hover:bg-primary/15 hover:border-primary/30 transition-all duration-200 group text-left shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/20 rounded-[var(--radius-lg)] p-3 group-hover:bg-primary/30 transition-colors">
            <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('calendar.profileButton')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('calendar.profileHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
        </Link>

        {/* About & Help */}
        <Link
          href="/about"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <Info className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('profile.sections.aboutHelp')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.sections.aboutHelpHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* Advanced */}
        <Link
          href="/advanced"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <Wrench className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('profile.sections.advanced')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.sections.advancedHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <h2 className="form-label pt-2">{t('profile.sections.accountActions')}</h2>

        {/* Logout */}
        <button
          className="w-full py-4 rounded-[var(--radius-xl)] border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center gap-2"
          onClick={() => logout()}
        >
          <LogOut className="size-4" />
          {t('profile.logout')}
        </button>

        {/* Fresh Start */}
        <button
          className="w-full py-4 rounded-[var(--radius-xl)] border border-primary/30 text-primary font-bold text-sm hover:bg-primary/10 transition-all duration-200 flex items-center justify-center gap-2"
          onClick={() => setShowResetModal(true)}
        >
          <RotateCcw className="size-4" />
          {t('profile.freshStart.button')}
        </button>

        {/* Delete Account */}
        <button
          className="w-full py-3.5 rounded-[var(--radius-xl)] text-red-500/60 text-xs hover:text-red-400 transition-all duration-200 flex items-center justify-center gap-1.5"
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 className="size-3.5" />
          {t('profile.deleteAccount.button')}
        </button>
      </div>

      {/* Fresh Start Modal */}
      <FreshStartModal open={showResetModal} onOpenChange={setShowResetModal} />

      {/* Delete Account Modal */}
      <DeleteAccountModal open={showDeleteModal} onOpenChange={setShowDeleteModal} profile={profile} />
    </div>
  )
}
