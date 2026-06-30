import Link from 'next/link'
import type { PublicProfileView as PublicProfileViewData } from '@orbit/shared/types/public-profile'

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
    <div className="flex flex-col py-8" style={{ gap: 18 }}>
      <header
        className="flex flex-col items-center text-center"
        style={{ borderRadius: 22, background: 'var(--gradient-header)', padding: '36px 24px 30px', gap: 10 }}
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
            color: 'var(--fg-on-primary)',
          }}
        >
          {initial}
        </span>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--fg-on-primary)' }}>
          {view.displayName}
        </h1>
        {view.handle && (
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'color-mix(in srgb, var(--fg-on-primary) 78%, transparent)' }}>
            @{view.handle}
          </p>
        )}
      </header>

      {(view.currentStreak != null || view.level != null) && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {view.currentStreak != null && (
            <div className="flex flex-col" style={{ ...cardStyle, padding: '18px 18px', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-1)', lineHeight: 1 }}>
                {view.currentStreak}
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
                {t('profile.publicProfile.view.dayStreakLabel')}
              </span>
              {view.longestStreak != null && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-4)' }}>
                  {t('profile.publicProfile.view.longestStreakLabel', { count: view.longestStreak })}
                </span>
              )}
            </div>
          )}
          {view.level != null && (
            <div className="flex flex-col justify-center" style={{ ...cardStyle, padding: '18px 18px', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--fg-1)' }}>
                {t('profile.publicProfile.view.level', { level: view.level })}
              </span>
              {view.levelTitle && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--primary-soft)' }}>
                  {view.levelTitle}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {view.achievements && view.achievements.length > 0 && (
        <section style={{ ...cardStyle, padding: '18px 18px' }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
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

      {view.topHabits && view.topHabits.length > 0 && (
        <section style={{ ...cardStyle, padding: '18px 18px' }}>
          <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
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
        style={{ borderRadius: 18, padding: '24px 20px', gap: 12, background: 'rgba(var(--primary-rgb), 0.10)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      >
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--fg-1)' }}>
          {t('profile.publicProfile.view.ctaTitle')}
        </h2>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.5 }}>
          {t('profile.publicProfile.view.ctaBody')}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-full"
          style={{
            marginTop: 2,
            padding: '12px 24px',
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(var(--primary-rgb), 0.35)',
          }}
        >
          {t('profile.publicProfile.view.ctaButton')}
        </Link>
      </section>

      <p className="text-center" style={{ margin: 0, padding: '4px 0 12px', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-4)' }}>
        {t('profile.publicProfile.view.tagline')}
      </p>
    </div>
  )
}
