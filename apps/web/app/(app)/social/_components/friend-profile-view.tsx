'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { motionLayerTiming, resolveMotionPreset } from '@orbit/shared/theme'
import { achievementEmoji, ApiClientError } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
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
  background: 'var(--bg-elev)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
} as const

const statValueStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 34,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-1)',
  lineHeight: 1,
} as const

const statLabelStyle = {
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

/** Overlay showing an accepted friend's public profile: avatar/handle, streak, level, and
 *  achievement chips. Renders the permanent "unavailable" state on 403/404 or a missing view,
 *  and a retryable error state on transient failures. */
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
  const sectionPreset = resolveMotionPreset('list-enter', Boolean(prefersReducedMotion))

  function sectionMotion(index: number) {
    return {
      initial: { opacity: 0, y: sectionPreset.shift },
      animate: {
        opacity: 1,
        y: 0,
        transition: {
          duration: sectionPreset.enterDuration / 1000,
          ease: sectionPreset.enterEasing,
          delay: (index * motionLayerTiming.contentStagger) / 1000,
        },
      },
    }
  }

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={displayName}>
      {isLoading ? (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="flex items-center justify-center"
          style={{ minHeight: 220 }}
        >
          <Loader2 className="size-[22px] animate-spin" style={{ color: 'var(--primary)' }} />
        </div>
      ) : isError || !view ? (
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
      ) : (
        <div className="flex flex-col" style={{ gap: 16, paddingTop: 4 }}>
          <div className="flex flex-col sm:flex-row sm:items-center" style={{ gap: 16 }}>
            <motion.div
              className="flex flex-col items-center text-center sm:flex-row sm:text-left"
              style={{ gap: 8 }}
              {...sectionMotion(0)}
            >
              <UserAvatar name={view.displayName} size={72} />
              {view.handle ? (
                <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-3)' }}>
                  @{view.handle}
                </p>
              ) : null}
            </motion.div>

            <motion.div
              className="grid sm:flex-1"
              style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}
              {...sectionMotion(1)}
            >
              <div className="flex flex-col" style={{ ...cardStyle, padding: '18px 18px', gap: 4 }}>
                <span style={statValueStyle}>{view.currentStreak}</span>
                <span style={statLabelStyle}>{t('profile.publicProfile.view.dayStreakLabel')}</span>
              </div>
              <div className="flex flex-col" style={{ ...cardStyle, padding: '18px 18px', gap: 4 }}>
                <span style={statValueStyle}>{view.level}</span>
                <span style={statLabelStyle}>{t('social.friendProfile.levelLabel')}</span>
              </div>
            </motion.div>
          </div>

          <motion.section style={{ ...cardStyle, padding: '18px 18px' }} {...sectionMotion(2)}>
            <h2
              style={{
                margin: '0 0 12px',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--fg-3)',
              }}
            >
              {t('profile.publicProfile.view.achievementsTitle')}
            </h2>
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
      )}
    </AppOverlay>
  )
}
