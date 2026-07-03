import Link from 'next/link'
import type { PublicProfileView as PublicProfileViewData } from '@orbit/shared/types/public-profile'
import { AppLogo } from '@/components/ui/app-logo'
import { GradientTop } from '@/components/ui/gradient-top'
import { StatTile } from '@/components/ui/stat-tile'

/** A next-intl translator scoped to the full message tree, accepting runtime string keys
 *  (the public view localizes achievement names by dynamic icon key). */
export type PublicProfileTranslator = {
  (key: string, values?: Record<string, string | number>): string
  has: (key: string) => boolean
}

interface PublicProfileViewProps {
  view: PublicProfileViewData
  t: PublicProfileTranslator
}

const cardStyle = {
  borderRadius: 18,
  background: 'var(--bg-elev)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
} as const

/** Server-rendered public profile card shown to logged-out visitors at /u/{slug}.
 *  Renders only the fields the API returned, localized in the owner's language. */
export function PublicProfileView({ view, t }: Readonly<PublicProfileViewProps>) {
  const initial = view.displayName.trim().charAt(0).toUpperCase() || 'O'

  return (
    <div
      className="stagger-enter relative mx-auto flex w-full max-w-[var(--app-max-w)] flex-col py-8"
      style={{ gap: 18 }}
    >
      <GradientTop height={260} />

      <Link
        href="/login"
        aria-label={t('profile.publicProfile.view.backToOrbit')}
        className="relative z-[1] inline-flex items-center self-start rounded-full transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-80"
        style={{ gap: 8, padding: '2px 4px' }}
      >
        <AppLogo size={28} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--fg-1)',
          }}
        >
          Orbit
        </span>
      </Link>

      <header
        className="relative z-[1] flex flex-col items-center text-center"
        style={{ padding: '8px 24px 12px', gap: 10 }}
      >
        <span
          aria-hidden="true"
          className="flex items-center justify-center rounded-full"
          style={{
            width: 72,
            height: 72,
            background: 'rgba(var(--primary-rgb), 0.22)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 600,
            color: 'var(--fg-1)',
          }}
        >
          {initial}
        </span>
        <h1 className="t-display" style={{ margin: 0 }}>
          {view.displayName}
        </h1>
        {view.handle && (
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-3)' }}>
            @{view.handle}
          </p>
        )}
      </header>

      <div className="relative z-[1] flex flex-col" style={{ gap: 18 }}>
        <div className="flex flex-col" style={{ gap: 18 }}>
          {(view.currentStreak != null || view.level != null) && (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <div className="grid grid-cols-2" style={{ gap: 12 }}>
                {view.currentStreak != null && (
                  <StatTile
                    emoji="🔥"
                    value={view.currentStreak}
                    label={t('profile.publicProfile.view.dayStreakLabel')}
                  />
                )}
                {view.level != null && (
                  <StatTile
                    emoji="🏆"
                    value={t('profile.publicProfile.view.level', { level: view.level })}
                    label={view.levelTitle ?? ''}
                    phraseValue
                  />
                )}
              </div>
              {view.longestStreak != null && (
                <p className="t-meta text-center" style={{ margin: 0 }}>
                  {t('profile.publicProfile.view.longestStreakLabel', { count: view.longestStreak })}
                </p>
              )}
            </div>
          )}

          {view.achievements && view.achievements.length > 0 && (
            <section style={{ ...cardStyle, padding: '18px 18px' }}>
              <h2 className="t-eyebrow" style={{ margin: '0 0 12px' }}>
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
          )}
        </div>

        <div className="flex flex-col" style={{ gap: 18 }}>
          {view.topHabits && view.topHabits.length > 0 && (
            <section style={{ ...cardStyle, padding: '18px 18px' }}>
              <h2 className="t-eyebrow" style={{ margin: '0 0 10px' }}>
                {t('profile.publicProfile.view.topHabitsTitle')}
              </h2>
              <ul className="flex flex-col" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
                {view.topHabits.map((habit) => (
                  <li key={habit} style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}>
                    {habit}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            className="flex flex-col items-center text-center"
            style={{
              borderRadius: 18,
              padding: '24px 20px',
              gap: 12,
              background: 'rgba(var(--primary-rgb), 0.08)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
            }}
          >
            <h2 className="t-h2" style={{ margin: 0 }}>
              {t('profile.publicProfile.view.ctaTitle')}
            </h2>
            <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.5 }}>
              {t('profile.publicProfile.view.ctaBody')}
            </p>
            <Link href="/login" className="pill-link" style={{ marginTop: 2 }}>
              {t('profile.publicProfile.view.ctaButton')}
            </Link>
          </section>
        </div>
      </div>

      <p
        className="relative z-[1] text-center"
        style={{ margin: 0, padding: '4px 0 12px', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-4)' }}
      >
        {t('profile.publicProfile.view.tagline')}
      </p>
    </div>
  )
}
