'use client'

import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
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

/** Overlay showing an accepted friend's public profile: avatar/handle, streak, level, and
 *  achievement chips. Falls back to a graceful "unavailable" state on 403/404 or any load failure. */
export function FriendProfileView({
  userId,
  displayName,
  open,
  onOpenChange,
}: Readonly<FriendProfileViewProps>) {
  const t = useTranslations()
  const { data: view, isLoading, isError } = useFriendProfile(open ? userId : null)

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={displayName}>
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ minHeight: 220 }}>
          <span
            aria-label={t('common.loading')}
            className="animate-spin rounded-full"
            style={{
              width: 28,
              height: 28,
              border: '2.5px solid var(--hairline)',
              borderTopColor: 'var(--primary)',
            }}
          />
        </div>
      ) : isError || !view ? (
        <div
          className="flex flex-col items-center text-center"
          style={{ minHeight: 220, justifyContent: 'center', gap: 14, padding: '16px 12px' }}
        >
          <SatelliteGlyph size={84} />
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-3)', lineHeight: 1.5 }}>
            {t('social.friendProfile.unavailable')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 16, paddingTop: 4 }}>
          <div className="flex flex-col items-center text-center" style={{ gap: 8 }}>
            <UserAvatar name={view.displayName} size={72} />
            {view.handle ? (
              <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-3)' }}>
                @{view.handle}
              </p>
            ) : null}
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="flex flex-col" style={{ ...cardStyle, padding: '18px 18px', gap: 4 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 34,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--fg-1)',
                  lineHeight: 1,
                }}
              >
                {view.currentStreak}
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
                {t('profile.publicProfile.view.dayStreakLabel')}
              </span>
            </div>
            <div className="flex flex-col justify-center" style={{ ...cardStyle, padding: '18px 18px', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--fg-1)' }}>
                {t('profile.publicProfile.view.level', { level: view.level })}
              </span>
            </div>
          </div>

          {view.achievements.length > 0 ? (
            <section style={{ ...cardStyle, padding: '18px 18px' }}>
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
                      {t.has(key) ? t(key) : achievement.name}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </AppOverlay>
  )
}
