'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Users } from '@/components/ui/icons'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* incl. components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { motion, useReducedMotion } from 'motion/react'
import type { FriendProfileView as FriendProfileViewData } from '@orbit/shared/types/social'
import { motionLayerTiming, resolveMotionPreset } from '@orbit/shared/theme'
import { achievementEmoji, ApiClientError, capitalizeFirstLetter, formatLocaleDate } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SkeletonLine } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useFriendProfile } from '@/hooks/use-friends'

interface FriendProfileViewProps {
  userId: string | null
  displayName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const cardStyle = {
  borderRadius: 18,
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
  padding: 18,
} as const

const sectionHeadingStyle = {
  margin: '0 0 12px',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
} as const

const metaStyle = {
  margin: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--fg-3)',
} as const

const errorCopyStyle = {
  margin: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  color: 'var(--fg-3)',
  lineHeight: 1.5,
} as const

/** Overlay showing an accepted friend's rich profile: identity, stat tiles, a 7-day activity strip,
 *  top habits, any shared accountability or challenge context, and achievement chips. Renders the
 *  permanent "unavailable" state on 403/404 or a missing view, and a retryable transient error. */
export function FriendProfileView({
  userId,
  displayName,
  open,
  onOpenChange,
}: Readonly<FriendProfileViewProps>) {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const { data: view, isLoading, isError, error, refetch } = useFriendProfile(open ? userId : null)

  const profileUnavailable =
    !isError || (error instanceof ApiClientError && (error.status === 403 || error.status === 404))

  const renderProfileContent = () => {
    if (isLoading) {
      return <FriendProfileSkeleton loadingLabel={t('common.loading')} />
    }
    if (isError || !view) {
      return (
        <div
          className="flex flex-col items-center text-center"
          style={{ minHeight: 220, justifyContent: 'center', gap: 14, padding: '16px 12px' }}
        >
          {profileUnavailable ? <SatelliteGlyph size={84} /> : null}
          <p style={errorCopyStyle}>
            {t(
              profileUnavailable
                ? 'social.friendProfile.unavailable'
                : 'social.friendProfile.loadError',
            )}
          </p>
          {profileUnavailable ? null : (
            <PillButton variant="ghost" onClick={() => void refetch()}>
              {t('common.retry')}
            </PillButton>
          )}
        </div>
      )
    }
    return <ProfileBody view={view} reducedMotion={Boolean(prefersReducedMotion)} />
  }

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={displayName}>
      {renderProfileContent()}
    </AppOverlay>
  )
}

function FriendProfileSkeleton({ loadingLabel }: Readonly<{ loadingLabel: string }>) {
  return (
    <div
      role="status"
      aria-label={loadingLabel}
      className="flex flex-col"
      style={{ gap: 14, paddingTop: 4 }}
    >
      <div className="flex flex-col items-center" style={{ gap: 10 }}>
        <div
          aria-hidden="true"
          className="skeleton-pulse rounded-full bg-[color-mix(in_srgb,var(--fg-1)_6%,transparent)]"
          style={{ width: 72, height: 72 }}
        />
        <SkeletonLine width="w-24" height="h-3" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col"
            style={{ ...cardStyle, gap: 8, padding: 16 }}
          >
            <SkeletonLine width="w-10" height="h-6" />
            <SkeletonLine width="w-2/3" height="h-3" />
          </div>
        ))}
      </div>
      <div className="flex flex-col" style={{ ...cardStyle, gap: 12 }}>
        <SkeletonLine width="w-1/3" height="h-3" />
        <SkeletonLine width="w-full" height="h-8" />
      </div>
    </div>
  )
}

function ProfileBody({
  view,
  reducedMotion,
}: Readonly<{ view: FriendProfileViewData; reducedMotion: boolean }>) {
  const t = useTranslations()
  const locale = useLocale()
  const preset = resolveMotionPreset('list-enter', reducedMotion)

  const friendsSince = view.friendsSinceUtc
    ? capitalizeFirstLetter(formatLocaleDate(view.friendsSinceUtc, locale, { month: 'long', year: 'numeric' }))
    : null

  function section(index: number) {
    return {
      initial: { opacity: 0, y: preset.shift },
      animate: {
        opacity: 1,
        y: 0,
        transition: {
          duration: preset.enterDuration / 1000,
          ease: preset.enterEasing,
          delay: (index * motionLayerTiming.contentStagger) / 1000,
        },
      },
    }
  }

  const hasSharedContext = view.isAccountabilityPartner || view.sharedChallenges.length > 0

  return (
    <div className="flex flex-col" style={{ gap: 14, paddingTop: 4 }}>
      <motion.div className="flex flex-col items-center text-center" style={{ gap: 6 }} {...section(0)}>
        <UserAvatar name={view.displayName} size={72} />
        {view.handle ? (
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-3)' }}>
            @{view.handle}
          </p>
        ) : null}
        {friendsSince ? <p style={metaStyle}>{t('social.friendProfile.friendsSince', { date: friendsSince })}</p> : null}
      </motion.div>

      <motion.div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}
        {...section(1)}
      >
        <StatTile emoji="🔥" value={view.currentStreak} label={t('profile.publicProfile.view.dayStreakLabel')} />
        <StatTile emoji="🥇" value={view.longestStreak} label={t('social.friendProfile.longestStreakLabel')} />
        <StatTile emoji="🏆" value={view.level} label={view.levelTitle} />
        <StatTile emoji="✨" value={view.totalXp} label={t('social.friendProfile.xpLabel')} />
      </motion.div>

      <motion.section style={cardStyle} {...section(2)}>
        <h2 style={sectionHeadingStyle}>{t('social.friendProfile.activityLabel')}</h2>
        <ActivityStrip counts={view.weeklyActivity} locale={locale} />
      </motion.section>

      {view.topHabits.length > 0 ? (
        <motion.section style={cardStyle} {...section(3)}>
          <h2 style={sectionHeadingStyle}>{t('profile.publicProfile.view.topHabitsTitle')}</h2>
          <TopHabitsList habits={view.topHabits} />
        </motion.section>
      ) : null}

      {hasSharedContext ? (
        <motion.section style={cardStyle} {...section(4)}>
          {view.isAccountabilityPartner ? (
            <div className="flex items-center" style={{ gap: 10 }}>
              <Users className="size-[18px]" style={{ color: 'var(--primary)' }} aria-hidden="true" />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}>
                {t('social.friendProfile.accountabilityPartner')}
              </span>
            </div>
          ) : null}
          {view.sharedChallenges.length > 0 ? (
            <div style={{ marginTop: view.isAccountabilityPartner ? 14 : 0 }}>
              <h3 style={sectionHeadingStyle}>{t('social.friendProfile.sharedChallengesTitle')}</h3>
              <ul className="flex flex-col" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
                {view.sharedChallenges.map((challenge) => (
                  <li
                    key={challenge.id}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}
                  >
                    {challenge.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </motion.section>
      ) : null}

      <motion.section style={cardStyle} {...section(5)}>
        <h2 style={sectionHeadingStyle}>{t('profile.publicProfile.view.achievementsTitle')}</h2>
        {view.achievements.length > 0 ? (
          <ul className="flex flex-wrap" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
            {view.achievements.map((achievement) => {
              const key = `gamification.achievements.${achievement.iconKey}.name`
              return (
                <li
                  key={achievement.iconKey}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--fg-2)',
                    padding: '7px 12px',
                    borderRadius: 999,
                    background: 'rgba(var(--primary-rgb), 0.12)',
                  }}
                >
                  <span aria-hidden="true">{achievementEmoji(achievement.iconKey)}</span>{' '}
                  {t.has(key) ? t(key) : achievement.name}
                </li>
              )
            })}
          </ul>
        ) : (
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-4)' }}>
            {t('social.friendProfile.noAchievements')}
          </p>
        )}
      </motion.section>
    </div>
  )
}

function ActivityStrip({ counts, locale }: Readonly<{ counts: readonly number[]; locale: string }>) {
  const days = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
    const base = new Date()
    return Array.from({ length: counts.length }, (_, index) => {
      const date = new Date(base)
      date.setDate(base.getDate() - (counts.length - 1 - index))
      // react-doctor-disable-next-line no-locale-format-in-render -- ActivityStrip only renders inside the client-opened friend drawer (data-gated on useFriendProfile), so there is no SSR pass to diverge; weekday-narrow uses the user's locale+tz intentionally https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      return { key: date.toISOString().slice(0, 10), label: formatter.format(date) }
    })
  }, [counts.length, locale])

  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${counts.length}, 1fr)`, gap: 6 }}>
      {days.map((day, index) => (
        <div key={day.key} className="flex flex-col items-center" style={{ gap: 6 }}>
          <div
            style={{
              height: 30,
              width: '100%',
              maxWidth: 22,
              borderRadius: 7,
              background: counts[index]! > 0 ? 'rgba(var(--primary-rgb), 0.9)' : 'var(--status-empty)',
            }}
          />
          {/* react-doctor-disable-next-line no-tiny-text -- intentional mono-style weekday-initial meta label in the activity strip, not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243 */}
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-4)' }}>{day.label}</span>
        </div>
      ))}
    </div>
  )
}

function TopHabitsList({
  habits,
}: Readonly<{ habits: FriendProfileViewData['topHabits'] }>) {
  return (
    <ul className="flex flex-col" style={{ gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
      {habits.map((habit) => (
        <li key={habit.title} className="flex items-center" style={{ gap: 12 }}>
          <span
            className="flex items-center justify-center shrink-0"
            style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-field)', fontSize: 18 }}
            aria-hidden="true"
          >
            {habit.emoji ?? '🎯'}
          </span>
          <span
            className="flex-1 truncate"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}
          >
            {habit.title}
          </span>
          <span
            className="shrink-0"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}
          >
            <span aria-hidden="true">🔥</span> {habit.completionCount}
          </span>
        </li>
      ))}
    </ul>
  )
}
