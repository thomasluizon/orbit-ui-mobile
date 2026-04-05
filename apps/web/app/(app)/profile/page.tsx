'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import { getErrorMessage } from '@orbit/shared/utils'
import {
  Settings,
  Sparkles,
  Info,
  Wrench,
  LogOut,
  RotateCcw,
  Trash2,
  ChevronRight,
  Clock,
  BadgeCheck,
  X,
  Check,
} from 'lucide-react'
import { parseISO, format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
import { ProfileStreakCard } from '@/components/gamification/profile-streak-card'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { resetAccount } from '@/app/actions/profile'
import { requestDeletion, confirmDeletion } from '@/app/actions/auth'

export default function ProfilePage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile, isLoading, error, invalidate } = useProfile()
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

  // --- Fresh Start ---
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetStep, setResetStep] = useState<'info' | 'confirm'>('info')
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [showFreshStartAnimation, setShowFreshStartAnimation] = useState(false)

  const isResetConfirmed = resetConfirmText.trim().toUpperCase() === 'ORBIT'

  function openResetModal() {
    setResetStep('info')
    setResetConfirmText('')
    setResetError('')
    setResetLoading(false)
    setShowResetModal(true)
  }

  async function handleResetAccount() {
    if (!isResetConfirmed) return
    setResetLoading(true)
    setResetError('')
    try {
      await resetAccount()
      localStorage.removeItem('orbit:checklist-templates')
      localStorage.removeItem('orbit_trial_expired_seen')
      // Close modal, show animation (matches Vue flow)
      setShowResetModal(false)
      setShowFreshStartAnimation(true)
    } catch (err: unknown) {
      setResetError(getErrorMessage(err, t('profile.freshStart.errorGeneric')))
    } finally {
      setResetLoading(false)
    }
  }

  function handleFreshStartComplete() {
    setShowFreshStartAnimation(false)
    // Clear all query caches so stale pre-reset data doesn't linger
    queryClient.clear()
    globalThis.location.href = '/'
  }

  // --- Delete Account ---
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [deleteCode, setDeleteCode] = useState(['', '', '', '', '', ''])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string | null>(null)

  function openDeleteModal() {
    setDeleteStep('confirm')
    setDeleteCode(['', '', '', '', '', ''])
    setDeleteError('')
    setDeleteLoading(false)
    setScheduledDeletionDate(null)
    setShowDeleteModal(true)
  }

  async function handleRequestDeletion() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await requestDeletion()
      setDeleteStep('code')
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, t('profile.deleteAccount.errorGeneric')))
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleConfirmDeletion() {
    const code = deleteCode.join('')
    if (code.length !== 6) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const response = await confirmDeletion(code)
      setScheduledDeletionDate(response.scheduledDeletionAt ?? null)
      setDeleteStep('deactivated')
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, t('profile.deleteAccount.errorGeneric')))
    } finally {
      setDeleteLoading(false)
    }
  }

  function handleDeleteCodeInput(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.replaceAll(/\D/g, '')
    const next = [...deleteCode]
    next[index] = value.slice(-1)
    setDeleteCode(next)
    if (value && index < 5) {
      const nextInput = event.target.parentElement?.children[index + 1] as HTMLInputElement
      nextInput?.focus()
    }
  }

  function handleDeleteCodeKeydown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !deleteCode[index] && index > 0) {
      const prev = (event.target as HTMLElement).parentElement?.children[index - 1] as HTMLInputElement
      prev?.focus()
    }
  }

  function handleDeleteCodePaste(event: React.ClipboardEvent) {
    const paste = event.clipboardData?.getData('text')?.replaceAll(/\D/g, '')?.slice(0, 6)
    if (paste) {
      const next = [...deleteCode]
      for (let i = 0; i < 6; i++) {
        next[i] = paste[i] || ''
      }
      setDeleteCode(next)
      event.preventDefault()
    }
  }

  const deleteWarningMessage = useMemo(() => {
    if (profile?.hasProAccess && profile?.planExpiresAt) {
      return t('profile.deleteAccount.warningPro', { date: format(parseISO(profile.planExpiresAt), 'PPP', { locale: dateFnsLocale }) })
    }
    return t('profile.deleteAccount.warningFree')
  }, [profile?.hasProAccess, profile?.planExpiresAt, dateFnsLocale, t])

  const formattedDeletionDate = useMemo(() => {
    if (!scheduledDeletionDate) return ''
    return format(parseISO(scheduledDeletionDate), 'PPP', { locale: dateFnsLocale })
  }, [scheduledDeletionDate, dateFnsLocale])

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
        <Link
          href="/upgrade"
          className={`w-full rounded-[var(--radius-xl)] p-5 flex items-center gap-4 transition-all duration-200 group text-left shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] ${
            profile?.isTrialActive || profile?.hasProAccess
              ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30'
              : 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/30'
          }`}
        >
          <div
            className={`shrink-0 flex items-center justify-center rounded-[var(--radius-lg)] p-3 transition-colors ${
              profile?.isTrialActive || profile?.hasProAccess
                ? 'bg-primary/20 group-hover:bg-primary/30'
                : 'bg-amber-500/20 group-hover:bg-amber-500/30'
            }`}
          >
            {profile?.isTrialActive ? (
              <Clock className={`size-5 ${profile?.isTrialActive || profile?.hasProAccess ? 'text-primary' : 'text-amber-400'}`} />
            ) : profile?.hasProAccess ? (
              <BadgeCheck className={`size-5 ${profile?.isTrialActive || profile?.hasProAccess ? 'text-primary' : 'text-amber-400'}`} />
            ) : (
              <Sparkles className={`size-5 ${profile?.isTrialActive || profile?.hasProAccess ? 'text-primary' : 'text-amber-400'}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {profile?.isTrialActive
                ? t('profile.subscription.trial')
                : profile?.hasProAccess
                  ? t('profile.subscription.pro')
                  : trialExpired
                    ? t('profile.subscription.trialEnded')
                    : t('profile.subscription.free')}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {profile?.isTrialActive
                ? plural(t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)
                : profile?.hasProAccess
                  ? t('profile.subscription.proHint')
                  : trialExpired
                    ? t('profile.subscription.trialEndedHint')
                    : t('profile.subscription.freeHint')}
            </p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

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
          onClick={openResetModal}
        >
          <RotateCcw className="size-4" />
          {t('profile.freshStart.button')}
        </button>

        {/* Delete Account */}
        <button
          className="w-full py-3.5 rounded-[var(--radius-xl)] text-red-500/60 text-xs hover:text-red-400 transition-all duration-200 flex items-center justify-center gap-1.5"
          onClick={openDeleteModal}
        >
          <Trash2 className="size-3.5" />
          {t('profile.deleteAccount.button')}
        </button>
      </div>

      {/* Fresh Start Modal */}
      <AppOverlay
        open={showResetModal}
        onOpenChange={setShowResetModal}
        title={t('profile.freshStart.title')}
      >
        {resetStep === 'info' ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {t('profile.freshStart.description')}
            </p>

            {/* What gets deleted */}
            <div className="border border-primary/20 rounded-2xl p-4">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                {t('profile.freshStart.whatDeleted')}
              </p>
              <ul className="space-y-1.5">
                {[
                  t('profile.freshStart.deleteHabits'),
                  t('profile.freshStart.deleteGoals'),
                  t('profile.freshStart.deleteChat'),
                  t('profile.freshStart.deleteUserFacts'),
                  t('profile.freshStart.deleteAchievements'),
                  t('profile.freshStart.deleteNotifications'),
                  t('profile.freshStart.deleteChecklist'),
                  t('profile.freshStart.deleteOnboarding'),
                ].map((item) => (
                  <li key={item} className="text-xs text-text-secondary flex items-start gap-2">
                    <X className="size-3.5 text-red-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* What stays */}
            <div className="bg-success/10 border border-success/20 rounded-2xl p-4">
              <p className="text-xs font-bold text-success uppercase tracking-wider mb-2">
                {t('profile.freshStart.whatPreserved')}
              </p>
              <ul className="space-y-1.5">
                {[
                  t('profile.freshStart.preserveAccount'),
                  t('profile.freshStart.preserveSubscription'),
                  t('profile.freshStart.preservePreferences'),
                ].map((item) => (
                  <li key={item} className="text-xs text-text-secondary flex items-start gap-2">
                    <Check className="size-3.5 text-success shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <button
              className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors"
              onClick={() => setResetStep('confirm')}
            >
              {t('common.continue')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary text-center">
              {t('profile.freshStart.confirmInstruction')}
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="form-input text-center"
              placeholder={t('profile.freshStart.confirmPlaceholder')}
              autoComplete="off"
            />
            {resetError && (
              <p className="text-xs text-red-400 text-center">{resetError}</p>
            )}
            <button
              className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={!isResetConfirmed || resetLoading}
              onClick={handleResetAccount}
            >
              {resetLoading ? t('profile.freshStart.processing') : t('profile.freshStart.confirmButton')}
            </button>
          </div>
        )}
      </AppOverlay>

      {/* Fresh Start Animation */}
      {showFreshStartAnimation && (
        <FreshStartAnimation onComplete={handleFreshStartComplete} />
      )}

      {/* Delete Account Modal */}
      <AppOverlay
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title={t('profile.deleteAccount.title')}
      >
        {deleteStep === 'confirm' ? (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
              <p className="text-sm text-red-400 font-bold mb-2">{deleteWarningMessage}</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('profile.deleteAccount.warningDetail')}
              </p>
            </div>
            {deleteError && (
              <p className="text-xs text-red-400 text-center">{deleteError}</p>
            )}
            <button
              className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={deleteLoading}
              onClick={handleRequestDeletion}
            >
              {deleteLoading ? t('profile.deleteAccount.sending') : t('profile.deleteAccount.sendCode')}
            </button>
          </div>
        ) : deleteStep === 'code' ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary text-center">
              {t('profile.deleteAccount.codeInstructions')}
            </p>
            <div className="flex justify-center gap-2" onPaste={handleDeleteCodePaste}>
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  aria-label={t('auth.codeDigit', { n: i + 1 })}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className="w-11 h-13 text-center text-xl font-bold bg-surface-elevated border border-border rounded-xl text-text-primary focus:border-red-500 focus:outline-none transition-colors"
                  value={deleteCode[i]}
                  onChange={(e) => handleDeleteCodeInput(i, e)}
                  onKeyDown={(e) => handleDeleteCodeKeydown(i, e)}
                />
              ))}
            </div>
            {deleteError && (
              <p className="text-xs text-red-400 text-center">{deleteError}</p>
            )}
            <button
              className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={deleteLoading || deleteCode.join('').length !== 6}
              onClick={handleConfirmDeletion}
            >
              {deleteLoading ? t('profile.deleteAccount.deleting') : t('profile.deleteAccount.confirmDelete')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="size-5 text-amber-400" />
                <p className="text-sm text-amber-400 font-bold">
                  {t('profile.deleteAccount.title')}
                </p>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {t('profile.deleteAccount.deactivated', { date: formattedDeletionDate })}
              </p>
            </div>
            <button
              className="w-full py-3 rounded-2xl bg-surface-elevated text-text-primary font-bold text-sm hover:bg-border transition-colors"
              onClick={() => logout()}
            >
              {t('profile.logout')}
            </button>
          </div>
        )}
      </AppOverlay>
    </div>
  )
}
