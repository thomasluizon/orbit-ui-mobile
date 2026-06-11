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
import { User, Download, LogOut, RotateCcw, UserX } from 'lucide-react'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
} from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile, useStreakInfo } from '@/hooks/use-gamification'
import { AppBar } from '@/components/ui/app-bar'
import { Badge } from '@/components/ui/badge'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { StatTile } from '@/components/ui/stat-tile'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { plural } from '@/lib/plural'
import { SubscriptionCard } from './_components/subscription-card'
import { FreshStartModal } from './_components/fresh-start-modal'
import { DeleteAccountModal } from './_components/delete-account-modal'
import { ProfileNavIcon } from './_components/profile-nav-icon'
import { ProfileActionButton } from './_components/profile-action-button'
import { TourReplayModal } from './_components/tour-replay-modal'
import { exportUserData } from '@/app/actions/profile'

function StatTileButton({
  onClick,
  ariaLabel,
  dataTour,
  children,
}: Readonly<{
  onClick: () => void
  ariaLabel: string
  dataTour?: string
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex flex-1 cursor-pointer appearance-none rounded-[18px] border-0 bg-transparent p-0 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
    >
      {children}
    </button>
  )
}

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
  const { data: streakInfo } = useStreakInfo(profile?.hasProAccess ?? false)
  const streak = streakInfo?.currentStreak ?? 0
  const accountNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'account',
  )
  const achievementsNavItem = PROFILE_NAV_ITEMS.find(
    (item) => item.id === 'achievements',
  )
  const featureNavItems = PROFILE_NAV_ITEMS.filter(
    (item) => item.section === 'features' && item.id !== 'achievements',
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

  useEffect(() => {
    if (searchParams.get('subscription') === 'success') {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    }
  }, [searchParams, queryClient])

  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showTourReplay, setShowTourReplay] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExportData() {
    if (isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      const data = await exportUserData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `orbit-data-export-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError(t('dataExport.error'))
    } finally {
      setIsExporting(false)
    }
  }

  function handleNavClick(item: ProfileNavItem) {
    if (shouldRedirectProfileNavItem(item, profile)) {
      router.push('/upgrade')
      return
    }

    router.push(item.route)
  }

  const showPlanBadge = profile?.isTrialActive || profile?.hasProAccess
  const planBadgeTone = profile?.isTrialActive ? 'soft' : 'violet'
  const planBadgeLabel = profile?.isTrialActive
    ? t('trial.proBadge')
    : t('common.proBadge')

  const identityLine =
    profile?.hasProAccess && gamificationProfile
      ? t('gamification.profileCard.level', { level: gamificationProfile.level })
      : profile?.email

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -z-10"
        style={{
          left: 'calc(var(--app-px) * -1)',
          right: 'calc(var(--app-px) * -1)',
        }}
      >
        <GradientTop height={300} />
      </div>

      <AppBar
        leadingIcon={<User size={17} strokeWidth={1.5} color="var(--fg-2)" />}
        trailing={
          <>
            <ThemeToggle />
            <span data-tour="tour-streak-badge">
              <StreakBadge streak={streak} />
            </span>
            <NotificationBell />
          </>
        }
      />

      {error && (
        <p
          style={{
            margin: '12px 20px',
            fontFamily: 'var(--font-sans)',
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

      <div className="stagger-enter">
        <div
          className="flex flex-col items-center text-center"
          style={{ padding: '18px 20px 0', gap: 6 }}
        >
          {isLoading ? (
            <>
              <div
                className="animate-pulse rounded-full"
                style={{ width: 76, height: 22, background: 'var(--bg-elev)' }}
              />
              <div
                className="animate-pulse rounded-sm"
                style={{ width: 160, height: 30, background: 'var(--bg-elev)', marginTop: 4 }}
              />
              <div
                className="animate-pulse rounded-sm"
                style={{ width: 120, height: 14, background: 'var(--bg-elev)' }}
              />
            </>
          ) : (
            <>
              {showPlanBadge && <Badge tone={planBadgeTone}>{planBadgeLabel}</Badge>}
              <span
                className="max-w-full overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 32,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                  color: 'var(--fg-1)',
                }}
              >
                {profile?.name}
              </span>
              <span
                className="max-w-full overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 16,
                  color: 'var(--fg-2)',
                }}
              >
                {identityLine}
              </span>
            </>
          )}
        </div>

        <div className="flex px-5" style={{ gap: 14, marginTop: 24 }}>
          <StatTileButton
            dataTour="tour-profile-streak"
            ariaLabel={t('streakDisplay.title')}
            onClick={() => router.push('/streak')}
          >
            <StatTile
              emoji="🔥"
              value={`${streak} ${plural(t('streakDisplay.daysSuffix'), streak)}`}
              label={t('streakDisplay.title')}
            />
          </StatTileButton>
          {achievementsNavItem && (
            <StatTileButton
              dataTour={navTourMap[achievementsNavItem.id]}
              ariaLabel={t('gamification.profileCard.tileLabel')}
              onClick={() => handleNavClick(achievementsNavItem)}
            >
              <StatTile
                emoji="🏆"
                value={gamificationProfile?.achievementsEarned ?? 0}
                label={t('gamification.profileCard.tileLabel')}
              />
            </StatTileButton>
          )}
        </div>

        <div>
          <SectionLabel>{t('profile.sections.account')}</SectionLabel>
          <nav aria-label={t('profile.sections.account')} className="px-5">
            <SettingsGroup>
              {accountNavItems.map((item) => (
                <SettingsGroupRow
                  key={item.id}
                  icon={<ProfileNavIcon iconKey={item.iconKey} />}
                  label={t(item.titleKey)}
                  hint={getNavHint(item)}
                  proBadge={item.proBadge}
                  proBadgeLabel={t('common.proBadge')}
                  dataTour={navTourMap[item.id]}
                  onClick={() => handleNavClick(item)}
                />
              ))}
            </SettingsGroup>
          </nav>
        </div>

        <div>
          <SectionLabel>{t('profile.sections.features')}</SectionLabel>
          <div className="px-5">
            <SettingsGroup>
              <SettingsGroupRow
                icon={<ProfileNavIcon iconKey="compass" />}
                label={t('tour.replay.title')}
                hint={t('tour.replay.hint')}
                onClick={() => setShowTourReplay(true)}
              />
              {featureNavItems.map((item) => (
                <SettingsGroupRow
                  key={item.id}
                  icon={<ProfileNavIcon iconKey={item.iconKey} />}
                  label={t(item.titleKey)}
                  hint={getNavHint(item)}
                  proBadge={item.proBadge}
                  proBadgeLabel={t('common.proBadge')}
                  dataTour={navTourMap[item.id]}
                  onClick={() => handleNavClick(item)}
                />
              ))}
            </SettingsGroup>
          </div>
        </div>

        <div>
          <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
          <div data-tour="tour-profile-subscription" className="px-5">
            <SubscriptionCard
              profile={profile}
              trialDaysLeft={trialDaysLeft}
              trialExpired={trialExpired}
            />
          </div>
        </div>

        <div>
          <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
          <ProfileActionButton
            icon={Download}
            onClick={() => {
              void handleExportData()
            }}
            label={isExporting ? t('dataExport.preparing') : t('dataExport.button')}
          />
          {exportError && (
            <p
              style={{
                margin: '0 20px 8px',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--status-bad)',
              }}
            >
              {exportError}
            </p>
          )}
          <ProfileActionButton
            icon={RotateCcw}
            onClick={() => setShowResetModal(true)}
            label={t('profile.freshStart.button')}
          />
          <ProfileActionButton
            icon={UserX}
            onClick={() => setShowDeleteModal(true)}
            label={t('profile.deleteAccount.button')}
            tone="danger"
          />
          <ProfileActionButton
            icon={LogOut}
            onClick={() => logout()}
            label={t('profile.logout')}
          />
        </div>
      </div>

      <div style={{ height: 24 }} />

      <FreshStartModal open={showResetModal} onOpenChange={setShowResetModal} />
      <DeleteAccountModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        profile={profile}
      />
      <TourReplayModal open={showTourReplay} onOpenChange={setShowTourReplay} />
    </div>
  )
}
