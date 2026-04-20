'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { LogOut, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ProfileStreakCard } from '@/components/gamification/profile-streak-card'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { SubscriptionCard } from './_components/subscription-card'
import { FreshStartModal } from './_components/fresh-start-modal'
import { DeleteAccountModal } from './_components/delete-account-modal'
import { ProfileNavCard } from './_components/profile-nav-card'
import { ProfileActionButton } from './_components/profile-action-button'
import { ProfileNavIcon } from './_components/profile-nav-icon'
import { TourReplayCard } from './_components/tour-replay-card'

export default function ProfilePage() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile, isLoading, error } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialExpired = useTrialExpired()
  const logout = useAuthStore((s) => s.logout)
  const { profile: gamificationProfile } = useGamificationProfile(
    profile?.hasProAccess ?? false,
  )
  const accountNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'account',
  )
  const featureNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'features',
  )

  const navTourMap: Record<string, string> = {
    preferences: 'tour-profile-preferences',
    retrospective: 'tour-profile-retrospective',
    achievements: 'tour-profile-achievements',
  }

  const getNavHint = (item: ProfileNavItem): string => {
    if (
      item.hintMode === 'gamificationProfile' &&
      profile?.hasProAccess &&
      gamificationProfile
    ) {
      return `${t('gamification.profileCard.level', { level: gamificationProfile.level })} \u00B7 ${t('gamification.profileCard.totalXp', { total: gamificationProfile.totalXp })}`
    }
    return t(item.hintKey)
  }

  // Handle subscription success redirect -- refresh profile to pick up new plan
  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    }
  }, [searchParams, queryClient])

  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  function handleNavClick(item: ProfileNavItem) {
    if (shouldRedirectProfileNavItem(item, profile)) {
      router.push('/upgrade')
      return
    }

    router.push(item.route)
  }

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
          {process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : t('errors.loadProfile')}
        </p>
      )}

      <div className="space-y-4">
        {/* ==================== ACCOUNT ==================== */}
        <section
          className="space-y-4"
          aria-labelledby="profile-account-heading"
        >
          <h2 id="profile-account-heading" className="form-label pt-2">
            {t('profile.sections.account')}
          </h2>

          {/* User info card */}
          <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5">
            {isLoading ? (
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-full bg-surface-elevated skeleton-shimmer shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-36 bg-surface-elevated rounded skeleton-shimmer" />
                  <div className="h-4 w-52 bg-surface-elevated rounded skeleton-shimmer" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {/* Initials avatar */}
                <div className="size-14 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-primary">
                    {profile?.name
                      ? profile.name
                          .split(' ')
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                      : '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-text-primary truncate">
                    {profile?.name}
                  </p>
                  <p className="text-sm text-text-secondary truncate">
                    {profile?.email}
                  </p>
                  {profile?.hasProAccess && (
                    <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                      Pro
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Streak display */}
          <div data-tour="tour-profile-streak">
            <ProfileStreakCard />
          </div>

          {/* Subscription */}
          <div data-tour="tour-profile-subscription">
            <SubscriptionCard
              profile={profile}
              trialDaysLeft={trialDaysLeft}
              trialExpired={trialExpired}
            />
          </div>

          {/* ==================== NAVIGATION CARDS ==================== */}
          <nav aria-label={t('profile.sections.account')}>
            <div className="space-y-4 stagger-enter">
              {accountNavItems.map((item) => (
                <ProfileNavCard
                  key={item.id}
                  href={item.route}
                  onNavigate={(event) => {
                    if (!shouldRedirectProfileNavItem(item, profile)) return
                    event.preventDefault()
                    handleNavClick(item)
                  }}
                  icon={<ProfileNavIcon iconKey={item.iconKey} />}
                  title={t(item.titleKey)}
                  hint={getNavHint(item)}
                  proBadgeLabel={t('common.proBadge')}
                  dataTour={navTourMap[item.id]}
                />
              ))}
            </div>
          </nav>
        </section>

        {/* ==================== FEATURES ==================== */}
        <section
          className="space-y-4"
          aria-labelledby="profile-features-heading"
        >
          <h2 id="profile-features-heading" className="form-label pt-2">
            {t('profile.sections.features')}
          </h2>

          <div className="space-y-4 stagger-enter">
            <TourReplayCard />
            {featureNavItems.map((item) => (
              <ProfileNavCard
                key={item.id}
                href={item.route}
                onNavigate={(event) => {
                  if (!shouldRedirectProfileNavItem(item, profile)) return
                  event.preventDefault()
                  handleNavClick(item)
                }}
                icon={<ProfileNavIcon iconKey={item.iconKey} />}
                title={t(item.titleKey)}
                hint={getNavHint(item)}
                variant={item.variant}
                proBadge={item.proBadge}
                proBadgeLabel={t('common.proBadge')}
                dataTour={navTourMap[item.id]}
              />
            ))}
          </div>
        </section>

        {/* ==================== ACCOUNT ACTIONS ==================== */}
        <section
          className="space-y-4"
          aria-labelledby="profile-actions-heading"
        >
          <h2 id="profile-actions-heading" className="form-label pt-2">
            {t('profile.sections.accountActions')}
          </h2>

          {/* Logout */}
          <ProfileActionButton
            onClick={() => logout()}
            icon={<LogOut className="size-4" />}
            label={t('profile.logout')}
            tone="danger"
          />

          {/* Fresh Start */}
          <ProfileActionButton
            onClick={() => setShowResetModal(true)}
            icon={<RotateCcw className="size-4" />}
            label={t('profile.freshStart.button')}
            tone="primary"
          />

          {/* Delete Account */}
          <ProfileActionButton
            onClick={() => setShowDeleteModal(true)}
            icon={<Trash2 className="size-3.5" />}
            label={t('profile.deleteAccount.button')}
            tone="danger"
            compact
          />
        </section>
      </div>

      {/* Fresh Start Modal */}
      <FreshStartModal open={showResetModal} onOpenChange={setShowResetModal} />

      {/* Delete Account Modal */}
      <DeleteAccountModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        profile={profile}
      />
    </div>
  )
}
