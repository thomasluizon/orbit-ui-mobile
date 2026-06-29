'use client'

import { ChevronRight, Lock, Pencil, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { useReferral } from '@/hooks/use-referral'
import { plural } from '@/lib/plural'

interface ProfileSummaryCardProps {
  name?: string
  isLoading: boolean
  showPlanBadge: boolean
  planBadgeTone: BadgeTone
  planBadgeLabel: string
  levelLine?: string
  streak: number
  achievementsValue: number
  achievementsLocked: boolean
  showAchievements: boolean
  achievementsDataTour?: string
  onEditName: () => void
  onStreakClick: () => void
  onAchievementsClick: () => void
  onInvite: () => void
}

/**
 * Desktop-only (≥768px) profile panel: one translucent card pairing the user's
 * identity (initial disc, name, plan badge, level) with inline streak and
 * achievement stats and an invite row, all on a single surface so nothing nests.
 * Pairs with the wide settings column; the mobile profile renders its own stack.
 */
export function ProfileSummaryCard({
  name,
  isLoading,
  showPlanBadge,
  planBadgeTone,
  planBadgeLabel,
  levelLine,
  streak,
  achievementsValue,
  achievementsLocked,
  showAchievements,
  achievementsDataTour,
  onEditName,
  onStreakClick,
  onAchievementsClick,
  onInvite,
}: Readonly<ProfileSummaryCardProps>) {
  const t = useTranslations()
  const { stats, isLoading: referralLoading } = useReferral()
  const initial = name?.trim().charAt(0).toUpperCase() ?? ''

  const inviteHint =
    !referralLoading && stats
      ? t('referral.card.progress', {
          count: stats.successfulReferrals,
          max: stats.maxReferrals,
        })
      : t('referral.card.hint')

  return (
    <div
      className="rounded-[18px] bg-[var(--bg-card)]"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)', padding: '26px 16px 10px' }}
    >
      <div className="flex flex-col items-center text-center" style={{ gap: 10 }}>
        {isLoading ? (
          <>
            <div
              className="animate-pulse rounded-full"
              style={{ width: 64, height: 64, background: 'var(--bg-elev)' }}
            />
            <div
              className="animate-pulse rounded-lg"
              style={{ width: 150, height: 24, background: 'var(--bg-elev)' }}
            />
            <div
              className="animate-pulse rounded-lg"
              style={{ width: 90, height: 14, background: 'var(--bg-elev)' }}
            />
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="flex items-center justify-center rounded-full"
              style={{ width: 64, height: 64, background: 'rgba(var(--primary-rgb), 0.15)' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 26,
                  fontWeight: 700,
                  color: 'var(--primary-soft)',
                }}
              >
                {initial}
              </span>
            </span>
            {showPlanBadge && <Badge tone={planBadgeTone}>{planBadgeLabel}</Badge>}
            <button
              type="button"
              onClick={onEditName}
              aria-label={t('profile.editName.title')}
              className="flex max-w-full cursor-pointer appearance-none items-center justify-center border-0 bg-transparent p-0"
              style={{ gap: 6, minHeight: 36 }}
            >
              <span
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 21,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  color: 'var(--fg-1)',
                }}
              >
                {name}
              </span>
              <Pencil
                size={15}
                strokeWidth={1.8}
                color="var(--fg-3)"
                aria-hidden="true"
                className="shrink-0"
              />
            </button>
            {levelLine && (
              <span
                className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
              >
                {levelLine}
              </span>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2" style={{ marginTop: 20, gap: 4 }}>
        <ProfileStatButton
          emoji="🔥"
          value={`${streak} ${plural(t('streakDisplay.daysSuffix'), streak)}`}
          label={t('streakDisplay.title')}
          ariaLabel={t('streakDisplay.title')}
          onClick={onStreakClick}
        />
        {showAchievements && (
          <ProfileStatButton
            emoji="🏆"
            value={achievementsValue}
            label={t('gamification.profileCard.tileLabel')}
            ariaLabel={t('gamification.profileCard.tileLabel')}
            dataTour={achievementsDataTour}
            locked={achievementsLocked}
            onClick={onAchievementsClick}
          />
        )}
      </div>

      <div style={{ marginTop: 10, paddingTop: 6, borderTop: '1px solid var(--hairline)' }}>
        <button
          type="button"
          onClick={onInvite}
          className="flex w-full appearance-none items-center border-0 bg-transparent text-left transition-[background-color] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
          style={{ gap: 12, padding: '12px 8px', borderRadius: 12, minHeight: 56 }}
        >
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{ width: 40, height: 40, background: 'rgba(var(--primary-rgb), 0.15)' }}
          >
            <UserPlus size={20} strokeWidth={1.8} color="var(--primary-soft)" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {t('referral.card.title')}
            </span>
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}
            >
              {inviteHint}
            </span>
          </span>
          <ChevronRight
            size={20}
            strokeWidth={1.8}
            color="var(--fg-4)"
            aria-hidden="true"
            className="shrink-0"
          />
        </button>
      </div>
    </div>
  )
}

function ProfileStatButton({
  emoji,
  value,
  label,
  ariaLabel,
  dataTour,
  locked = false,
  onClick,
}: Readonly<{
  emoji: string
  value: string | number
  label: string
  ariaLabel: string
  dataTour?: string
  locked?: boolean
  onClick: () => void
}>) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      aria-label={ariaLabel}
      onClick={onClick}
      className="relative flex cursor-pointer appearance-none flex-col items-center border-0 bg-transparent transition-[background-color] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
      style={{ gap: 4, padding: '12px 8px', borderRadius: 14, minHeight: 44 }}
    >
      <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">
        {emoji}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-2)' }}>
        {label}
      </span>
      {locked && (
        <span
          aria-hidden="true"
          className="absolute flex items-center justify-center rounded-full"
          style={{ top: 6, right: 6, width: 20, height: 20, background: 'rgba(var(--primary-rgb), 0.12)' }}
        >
          <Lock size={11} strokeWidth={2} color="var(--primary)" />
        </span>
      )}
    </button>
  )
}
