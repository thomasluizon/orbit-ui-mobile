'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { AchievementCategorySection } from './_components/achievement-category-section'
import { AppBar } from '@/components/ui/app-bar'
import { ProBadge } from '@/components/ui/pro-badge'
import { ProgressBar } from '@/components/ui/progress-bar'
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
              aria-hidden="true"
              className="flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, background: 'var(--bg-field)' }}
            >
              <Lock size={28} strokeWidth={1.4} className="text-[var(--fg-3)]" />
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {t('gamification.page.lockedTitle')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--fg-3)',
                lineHeight: 1.55,
              }}
            >
              {t('gamification.page.lockedDescription')}
            </span>
            <Link
              href="/upgrade"
              className="inline-flex items-center justify-center transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--primary-pressed)]"
              style={{
                marginTop: 8,
                padding: '15px 26px',
                borderRadius: 999,
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                textDecoration: 'none',
                boxShadow: 'var(--primary-glow)',
              }}
            >
              {t('gamification.page.upgradeButton')}
            </Link>
          </div>
        ) : (
          <>
            {isLoading && !profile && (
              <div className="px-5 py-6 space-y-4">
                <div className="h-12 w-full rounded-lg skeleton-pulse" style={{ background: 'var(--bg-elev)' }} />
                <div className="h-6 w-32 rounded-lg skeleton-pulse" style={{ background: 'var(--bg-elev)' }} />
                <div className="h-24 w-full rounded-lg skeleton-pulse" style={{ background: 'var(--bg-elev)' }} />
              </div>
            )}

            {profile && (
              <>
                <div style={{ padding: '20px 20px 4px' }}>
                  <div
                    className="rounded-[18px]"
                    style={{
                      padding: 18,
                      background: 'rgba(var(--primary-rgb), 0.10)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
                    }}
                  >
                    <div className="flex items-center" style={{ gap: 14, marginBottom: 12 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 36,
                          fontWeight: 700,
                          letterSpacing: '-0.02em',
                          color: 'var(--fg-1)',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t('gamification.profileCard.level', { level: profile.level })}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="overflow-hidden whitespace-nowrap text-ellipsis"
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 15,
                            fontWeight: 500,
                            color: 'var(--fg-1)',
                          }}
                        >
                          {profile.levelTitle}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--fg-3)',
                            marginTop: 2,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {t('gamification.profileCard.xp', {
                            current: formatNum(profile.totalXp),
                            next: formatNum(profile.xpForNextLevel),
                          })}
                        </div>
                      </div>
                    </div>

                    <ProgressBar
                      progress={xpProgress / 100}
                      label={t('gamification.profileCard.xp', {
                        current: formatNum(profile.totalXp),
                        next: formatNum(profile.xpForNextLevel),
                      })}
                    />

                    <div
                      className="flex items-center justify-between"
                      style={{
                        marginTop: 10,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--fg-3)',
                        fontVariantNumeric: 'tabular-nums',
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
