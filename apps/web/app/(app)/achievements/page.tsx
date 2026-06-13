'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { AchievementCategorySection } from './_components/achievement-category-section'
import { AchievementXpCard } from './_components/achievement-xp-card'
import { AchievementsLockedState } from './_components/achievements-locked-state'
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
          <AchievementsLockedState />
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
                <AchievementXpCard
                  profile={profile}
                  xpProgress={xpProgress}
                  formatNum={formatNum}
                />

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
