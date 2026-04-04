'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
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
  ArrowLeft,
  X,
  Check,
  Flame,
} from 'lucide-react'
import { parseISO, format } from 'date-fns'
import { useProfile, useTrialDaysLeft, useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AppOverlay } from '@/components/ui/app-overlay'
import { resetAccount } from '@/app/actions/profile'
import { requestDeletion, confirmDeletion } from '@/app/actions/auth'

export default function ProfilePage() {
  const { profile, isLoading, error, invalidate } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)

  // --- Fresh Start ---
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetStep, setResetStep] = useState<'info' | 'confirm'>('info')
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

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
      setShowResetModal(false)
      // Hard reload for fresh state
      window.location.href = '/'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.' // i18n
      setResetError(msg)
    } finally {
      setResetLoading(false)
    }
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
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.' // i18n
      setDeleteError(msg)
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
      await confirmDeletion(code)
      // Assume successful -- show deactivated state
      setScheduledDeletionDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
      setDeleteStep('deactivated')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.' // i18n
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  function handleDeleteCodeInput(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.replace(/\D/g, '')
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
    const paste = event.clipboardData?.getData('text')?.replace(/\D/g, '')?.slice(0, 6)
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
      // i18n: "Your Pro subscription is active until {date}. Deleting your account will cancel it."
      return `Your Pro subscription is active until ${format(parseISO(profile.planExpiresAt), 'PPP')}. Deleting your account will cancel it.`
    }
    // i18n: "This will permanently delete your account and all data."
    return 'This will permanently delete your account and all data.'
  }, [profile?.hasProAccess, profile?.planExpiresAt])

  const formattedDeletionDate = useMemo(() => {
    if (!scheduledDeletionDate) return ''
    return format(parseISO(scheduledDeletionDate), 'PPP')
  }, [scheduledDeletionDate])

  // --- Subscription card styling ---
  const isActiveSubscription = profile?.isTrialActive || profile?.hasProAccess
  const subscriptionClasses = isActiveSubscription
    ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30'
    : 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/30'
  const subscriptionIconClasses = isActiveSubscription
    ? 'bg-primary/20 group-hover:bg-primary/30'
    : 'bg-amber-500/20 group-hover:bg-amber-500/30'

  return (
    <div className="pb-8">
      {/* Header */}
      <header className="pt-8 pb-6 flex items-center justify-between">
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {/* i18n: Profile */}
          Profile
        </h1>
        <ThemeToggle />
      </header>

      {/* Store error */}
      {error && (
        <p className="mb-4 text-sm text-red-400 text-center">
          {error instanceof Error ? error.message : 'Failed to load profile'}
        </p>
      )}

      <div className="space-y-4">
        {/* ==================== ACCOUNT ==================== */}
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted pt-2">
          {/* i18n: Account */}
          Account
        </h2>

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
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3">
            <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3">
              <Flame className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary">
                {/* i18n: {count} day streak */}
                {profile?.currentStreak ?? 0} day streak
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                {/* i18n: {count} streak freezes available */}
                {profile?.streakFreezesAvailable ?? 0} streak freezes available
              </p>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <Link
          href="/upgrade"
          className={`w-full rounded-[var(--radius-xl)] p-5 flex items-center gap-4 transition-all duration-200 group text-left shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] ${subscriptionClasses}`}
        >
          <div
            className={`shrink-0 flex items-center justify-center rounded-[var(--radius-lg)] p-3 transition-colors ${subscriptionIconClasses}`}
          >
            {profile?.isTrialActive ? (
              <Clock className="size-5 text-primary" />
            ) : profile?.hasProAccess ? (
              <BadgeCheck className="size-5 text-primary" />
            ) : (
              <Sparkles className="size-5 text-amber-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {/* i18n: subscription labels */}
              {profile?.isTrialActive
                ? 'Pro Trial'
                : profile?.hasProAccess
                  ? 'Orbit Pro'
                  : trialExpired
                    ? 'Trial Ended'
                    : 'Free Plan'}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {/* i18n: subscription hints */}
              {profile?.isTrialActive
                ? `${trialDaysLeft} days left in trial`
                : profile?.hasProAccess
                  ? 'All features unlocked'
                  : trialExpired
                    ? 'Upgrade to unlock all features'
                    : 'Upgrade for more features'}
            </p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* ==================== NAVIGATION CARDS ==================== */}

        {/* Preferences */}
        <NavCard
          href="/preferences"
          icon={<Settings className="size-5 text-primary" />}
          title="Preferences" // i18n
          hint="Theme, language, notifications" // i18n
        />

        {/* AI Features */}
        <NavCard
          href="/ai-settings"
          icon={<Sparkles className="size-5 text-primary" />}
          title="AI Features" // i18n
          hint="Memory, summaries, and more" // i18n
        />

        {/* About & Help */}
        <NavCard
          href="/about"
          icon={<Info className="size-5 text-primary" />}
          title="About & Help" // i18n
          hint="Feature guide, support, privacy" // i18n
        />

        {/* Advanced */}
        <NavCard
          href="/advanced"
          icon={<Wrench className="size-5 text-primary" />}
          title="Advanced" // i18n
          hint="Timezone, developer tools" // i18n
        />

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted pt-2">
          {/* i18n: Account Actions */}
          Account Actions
        </h2>

        {/* Logout */}
        <button
          className="w-full py-4 rounded-[var(--radius-xl)] border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center gap-2"
          onClick={() => logout()}
        >
          <LogOut className="size-4" />
          {/* i18n: Log Out */}
          Log Out
        </button>

        {/* Fresh Start */}
        <button
          className="w-full py-4 rounded-[var(--radius-xl)] border border-primary/30 text-primary font-bold text-sm hover:bg-primary/10 transition-all duration-200 flex items-center justify-center gap-2"
          onClick={openResetModal}
        >
          <RotateCcw className="size-4" />
          {/* i18n: Fresh Start */}
          Fresh Start
        </button>

        {/* Delete Account */}
        <button
          className="w-full py-3.5 rounded-[var(--radius-xl)] text-red-500/60 text-xs hover:text-red-400 transition-all duration-200 flex items-center justify-center gap-1.5"
          onClick={openDeleteModal}
        >
          <Trash2 className="size-3.5" />
          {/* i18n: Delete Account */}
          Delete Account
        </button>
      </div>

      {/* Fresh Start Modal */}
      <AppOverlay
        open={showResetModal}
        onOpenChange={setShowResetModal}
        title="Fresh Start" // i18n
      >
        {resetStep === 'info' ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {/* i18n */}
              Start over with a clean slate. This will delete all your data but keep your account and subscription.
            </p>

            {/* What gets deleted */}
            <div className="border border-primary/20 rounded-2xl p-4">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                {/* i18n: What gets deleted */}
                What gets deleted
              </p>
              <ul className="space-y-1.5">
                {[
                  'All habits and logs', // i18n
                  'All goals and progress', // i18n
                  'Chat history', // i18n
                  'AI memory (user facts)', // i18n
                  'Achievements and XP', // i18n
                  'Notifications', // i18n
                  'Checklist templates', // i18n
                  'Onboarding progress', // i18n
                ].map((item) => (
                  <li key={item} className="text-xs text-text-secondary flex items-start gap-2">
                    <X className="size-3.5 text-red-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* What stays */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                {/* i18n: What stays */}
                What stays
              </p>
              <ul className="space-y-1.5">
                {[
                  'Your account and email', // i18n
                  'Your subscription', // i18n
                  'Your preferences', // i18n
                ].map((item) => (
                  <li key={item} className="text-xs text-text-secondary flex items-start gap-2">
                    <Check className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <button
              className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors"
              onClick={() => setResetStep('confirm')}
            >
              {/* i18n: Continue */}
              Continue
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary text-center">
              {/* i18n: Type ORBIT to confirm */}
              Type <strong>ORBIT</strong> to confirm
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="w-full bg-surface-elevated text-text-primary placeholder-text-muted rounded-[var(--radius-lg)] py-2.5 px-4 text-sm text-center border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="ORBIT" // i18n
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
              {/* i18n: Reset My Account / Processing... */}
              {resetLoading ? 'Processing...' : 'Reset My Account'}
            </button>
          </div>
        )}
      </AppOverlay>

      {/* Delete Account Modal */}
      <AppOverlay
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Account" // i18n
      >
        {deleteStep === 'confirm' ? (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
              <p className="text-sm text-red-400 font-bold mb-2">{deleteWarningMessage}</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {/* i18n */}
                You will receive a confirmation code via email. Your account will be deactivated immediately and permanently deleted after 30 days.
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
              {/* i18n: Send Confirmation Code / Sending... */}
              {deleteLoading ? 'Sending...' : 'Send Confirmation Code'}
            </button>
          </div>
        ) : deleteStep === 'code' ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary text-center">
              {/* i18n */}
              Enter the 6-digit code sent to your email
            </p>
            <div className="flex justify-center gap-2" onPaste={handleDeleteCodePaste}>
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  aria-label={`Code digit ${i + 1}`}
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
              {/* i18n: Confirm Deletion / Deleting... */}
              {deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="size-5 text-amber-400" />
                <p className="text-sm text-amber-400 font-bold">
                  {/* i18n: Account Scheduled for Deletion */}
                  Account Scheduled for Deletion
                </p>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {/* i18n */}
                Your account has been deactivated and will be permanently deleted on {formattedDeletionDate}. Log in before then to cancel.
              </p>
            </div>
            <button
              className="w-full py-3 rounded-2xl bg-surface-elevated text-text-primary font-bold text-sm hover:bg-border transition-colors"
              onClick={() => logout()}
            >
              {/* i18n: Log Out */}
              Log Out
            </button>
          </div>
        )}
      </AppOverlay>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NavCard -- reusable navigation card for profile sub-pages
// ---------------------------------------------------------------------------

function NavCard({
  href,
  icon,
  title,
  hint,
}: {
  href: string
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <Link
      href={href}
      className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
    >
      <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{hint}</p>
      </div>
      <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
    </Link>
  )
}
