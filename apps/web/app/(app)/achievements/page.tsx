'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { AchievementCategorySection } from './_components/achievement-category-section'
import { AppBar } from '@/components/ui/app-bar'
import { ProBadge } from '@/components/ui/pro-badge'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

export default function AchievementsPage() {
  const t = useTranslations()
  const locale = useLocale()
  const formatNum = (n: number) => new Intl.NumberFormat(locale).format(n)
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile: accountProfile, isLoading: profileLoading } = useProfile()
  const hasProAccess = useHasProAccess()
  const {
    profile,
    isLoading,
    xpProgress,
    achievementsByCategory,
  } = useGamificationProfile(hasProAccess)

  useEffect(() => {
    if (accountProfile && !hasProAccess) {
      router.replace('/upgrade')
    }
  }, [accountProfile, hasProAccess, router])

  const subtitle = profile
    ? `${t('gamification.profileCard.level', { level: profile.level })} · ${profile.levelTitle}`
    : undefined

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('gamification.title')}
        subtitle={subtitle}
        trailing={<ProBadge />}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!profileLoading && !hasProAccess ? (
          <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 14 }}>
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--fg-1)',
              }}
            >
              {t('gamification.page.lockedTitle')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontStyle: 'italic',
                color: 'var(--fg-3)',
                lineHeight: 1.55,
              }}
            >
              {t('gamification.page.lockedDescription')}
            </span>
            <Link
              href="/upgrade"
              className="transition-[background-color] duration-150 ease-out hover:bg-[var(--primary-pressed)]"
              style={{
                marginTop: 8,
                padding: '10px 16px',
                borderRadius: 8,
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {t('gamification.page.upgradeButton')}
            </Link>
          </div>
        ) : (
          <>
            {isLoading && !profile && (
              <div className="px-5 py-6 space-y-4">
                <div className="h-12 w-full rounded-md skeleton-pulse" style={{ background: 'var(--bg-elev)' }} />
                <div className="h-6 w-32 rounded-md skeleton-pulse" style={{ background: 'var(--bg-elev)' }} />
                <div className="h-24 w-full rounded-md skeleton-pulse" style={{ background: 'var(--bg-elev)' }} />
              </div>
            )}

            {profile && (
              <>
                <div
                  style={{
                    padding: '20px 20px 12px',
                  }}
                >
                  <div className="flex items-center" style={{ gap: 16 }}>
                    <div
                      className="flex items-center justify-center shrink-0 size-14 rounded-full"
                      style={{
                        boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: 22,
                        fontWeight: 500,
                        color: 'var(--fg-1)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {profile.level}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontFamily: 'var(--font-family-sans)',
                          fontSize: 16,
                          fontWeight: 600,
                          color: 'var(--fg-1)',
                        }}
                      >
                        {profile.levelTitle}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: 11,
                          fontWeight: 500,
                          color: 'var(--fg-3)',
                          marginTop: 2,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {t('gamification.profileCard.xp', {
                          current: formatNum(profile.totalXp),
                          next: formatNum(profile.xpForNextLevel),
                        })}
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative w-full"
                    style={{
                      marginTop: 14,
                      height: 3,
                      background: 'var(--bg-sunk)',
                      borderRadius: 999,
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded-full"
                      style={{
                        width: `${xpProgress}%`,
                        background: 'var(--primary)',
                      }}
                    />
                  </div>

                  <div
                    className="flex items-center justify-between"
                    style={{
                      marginTop: 10,
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: 11,
                      color: 'var(--fg-3)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <span>
                      {t('gamification.profileCard.totalXp', {
                        total: formatNum(profile.totalXp),
                      })}
                    </span>
                    <span>
                      {t('gamification.profileCard.earned', {
                        count: profile.achievementsEarned,
                        total: profile.achievementsTotal,
                      })}
                    </span>
                  </div>
                </div>

                {achievementsByCategory.map((category) => (
                  <AchievementCategorySection
                    key={category.key}
                    category={category}
                    t={t}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
