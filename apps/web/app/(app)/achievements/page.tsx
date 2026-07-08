'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { deriveNextRewardCarrot } from '@orbit/shared/utils'
import { useProfile, useCanViewGamification } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { AchievementCategorySection } from './_components/achievement-category-section'
import { AchievementXpCard } from './_components/achievement-xp-card'
import { AchievementsLockedState } from './_components/achievements-locked-state'
import { NextRewardCarrot } from '../profile/_components/next-reward-carrot'
import { AppBar } from '@/components/ui/app-bar'
import { ProBadge } from '@/components/ui/pro-badge'
import { PillButton } from '@/components/ui/pill-button'
import { useDateFormat } from '@/hooks/use-date-format'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

export default function AchievementsPage() {
  const t = useTranslations()
  const locale = useLocale()
  const formatNum = (n: number) => new Intl.NumberFormat(locale).format(n)
  const { displayDate } = useDateFormat()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile: accountProfile, isLoading: profileLoading } = useProfile()
  const canViewGamification = useCanViewGamification()
  const {
    profile,
    isLoading,
    isError,
    refetch,
    xpProgress,
    achievementsByCategory,
  } = useGamificationProfile(canViewGamification)
  const nextRewardCarrot = deriveNextRewardCarrot(profile, canViewGamification)

  useEffect(() => {
    if (accountProfile && !canViewGamification) {
      router.replace('/upgrade')
    }
  }, [accountProfile, canViewGamification, router])

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
        {!profileLoading && !canViewGamification ? (
          <AchievementsLockedState />
        ) : (
          <>
            {isLoading && !profile && (
              <div className="px-5 py-6 space-y-4">
                <div className="h-12 w-full rounded-lg skeleton-pulse" style={{ background: 'var(--bg-card)' }} />
                <div className="h-6 w-32 rounded-lg skeleton-pulse" style={{ background: 'var(--bg-card)' }} />
                <div className="h-24 w-full rounded-lg skeleton-pulse" style={{ background: 'var(--bg-card)' }} />
              </div>
            )}

            {isError && !profile && (
              <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
                <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.55, color: 'var(--fg-2)' }}>
                  {t('common.error')}
                </p>
                <PillButton variant="ghost" onClick={() => void refetch()}>
                  {t('common.retry')}
                </PillButton>
              </div>
            )}

            {profile && (
              <div>
                <div>
                  <AchievementXpCard
                    profile={profile}
                    xpProgress={xpProgress}
                    formatNum={formatNum}
                  />
                </div>

                <div>
                  {achievementsByCategory.map((category) => (
                    <AchievementCategorySection
                      key={category.key}
                      category={category}
                      t={t}
                      displayDate={displayDate}
                    />
                  ))}
                </div>

                <div>
                  <NextRewardCarrot carrot={nextRewardCarrot} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
