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
import { useTranslations } from 'next-intl'
import { User } from 'lucide-react'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile, useStreakInfo } from '@/hooks/use-gamification'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { SubscriptionCard } from './_components/subscription-card'
import { FreshStartModal } from './_components/fresh-start-modal'
import { DeleteAccountModal } from './_components/delete-account-modal'
import { ProfileNavCard } from './_components/profile-nav-card'
import { ProfileActionButton } from './_components/profile-action-button'

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
  const { data: streakInfo } = useStreakInfo()
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
      return `${t('gamification.profileCard.level', { level: gamificationProfile.level })} · ${t('gamification.profileCard.totalXp', { total: gamificationProfile.totalXp })}`
    }
    return t(item.hintKey)
  }

  // Handle subscription success redirect — refresh profile to pick up new plan
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

  const userInitials = profile?.name
    ? profile.name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : '?'

  return (
    <div>
      <AppBar
        leadingIcon={<User size={17} strokeWidth={1.5} color="var(--fg-2)" />}
        title={t('profile.title')}
        trailing={
          <>
            <ThemeToggle />
            <span data-tour="tour-streak-badge">
              <StreakBadge streak={streakInfo?.currentStreak ?? 0} />
            </span>
            <NotificationBell />
          </>
        }
      />

      {error && (
        <p
          style={{
            margin: '12px 20px',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--status-bad)',
            textAlign: 'center',
          }}
        >
          {process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : t('errors.loadProfile')}
        </p>
      )}

      {/* User identity block */}
      <div
        className="flex items-center"
        style={{
          padding: '20px 20px 18px',
          gap: 14,
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        {isLoading ? (
          <>
            <div
              className="animate-pulse rounded-full shrink-0"
              style={{ width: 44, height: 44, background: 'var(--bg-elev)' }}
            />
            <div className="flex-1 flex flex-col" style={{ gap: 6 }}>
              <div
                className="animate-pulse rounded-sm"
                style={{ width: 140, height: 14, background: 'var(--bg-elev)' }}
              />
              <div
                className="animate-pulse rounded-sm"
                style={{ width: 200, height: 11, background: 'var(--bg-elev)' }}
              />
            </div>
          </>
        ) : (
          <>
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 44,
                height: 44,
                background: 'var(--bg-elev)',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--fg-1)',
              }}
            >
              {userInitials}
            </div>
            <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
              <span
                className="overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--fg-1)',
                }}
              >
                {profile?.name}
              </span>
              <span
                className="overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  color: 'var(--fg-3)',
                }}
              >
                {profile?.email}
              </span>
            </div>
            {profile?.hasProAccess && (
              <span
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--fg-on-primary)',
                  background: 'var(--primary)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {t('common.proBadge')}
              </span>
            )}
          </>
        )}
      </div>

      {/* Streak row */}
      <SettingsRow
        label={t('streakDisplay.title')}
        ariaLabel={t('streakDisplay.title')}
        onClick={() => router.push('/streak')}
        leadingDot={(streakInfo?.currentStreak ?? 0) > 0 ? 'var(--status-bad)' : undefined}
      >
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {streakInfo?.currentStreak ?? 0}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
          }}
        >
          {t('streakDisplay.daysSuffix')}
        </span>
      </SettingsRow>

      {/* Account section */}
      <SectionLabel>{t('profile.sections.account')}</SectionLabel>
      <nav aria-label={t('profile.sections.account')}>
        {accountNavItems.map((item) => (
          <ProfileNavCard
            key={item.id}
            href={item.route}
            icon={null}
            title={t(item.titleKey)}
            hint={getNavHint(item)}
            proBadgeLabel={t('common.proBadge')}
            dataTour={navTourMap[item.id]}
            onNavigate={(event) => {
              if (!shouldRedirectProfileNavItem(item, profile)) return
              event.preventDefault()
              handleNavClick(item)
            }}
          />
        ))}
      </nav>

      {/* Features section */}
      <SectionLabel>{t('profile.sections.features')}</SectionLabel>
      <div>
        {featureNavItems.map((item) => (
          <ProfileNavCard
            key={item.id}
            href={item.route}
            icon={null}
            title={t(item.titleKey)}
            hint={getNavHint(item)}
            variant={item.variant}
            proBadge={item.proBadge}
            proBadgeLabel={t('common.proBadge')}
            dataTour={navTourMap[item.id]}
            onNavigate={(event) => {
              if (!shouldRedirectProfileNavItem(item, profile)) return
              event.preventDefault()
              handleNavClick(item)
            }}
          />
        ))}
      </div>

      {/* Subscription section */}
      <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
      <div data-tour="tour-profile-subscription">
        <SubscriptionCard
          profile={profile}
          trialDaysLeft={trialDaysLeft}
          trialExpired={trialExpired}
        />
      </div>

      {/* Account actions */}
      <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
      <ProfileActionButton
        onClick={() => logout()}
        icon={null}
        label={t('profile.logout')}
        tone="default"
      />
      <ProfileActionButton
        onClick={() => setShowResetModal(true)}
        icon={null}
        label={t('profile.freshStart.button')}
        tone="default"
      />
      <ProfileActionButton
        onClick={() => setShowDeleteModal(true)}
        icon={null}
        label={t('profile.deleteAccount.button')}
        tone="danger"
        compact
      />

      <div style={{ height: 24 }} />

      <FreshStartModal open={showResetModal} onOpenChange={setShowResetModal} />
      <DeleteAccountModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        profile={profile}
      />
    </div>
  )
}
