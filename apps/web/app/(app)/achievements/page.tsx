'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { AchievementCategorySection } from './_components/achievement-category-section'
import { ProBadge } from '@/components/ui/pro-badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

export default function AchievementsPage() {
  const t = useTranslations()
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

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <button
          type="button"
          aria-label={t('common.backToProfile')}
          className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors"
          onClick={() => goBackOrFallback('/profile')}
        >
          <ArrowLeft className="size-5 text-text-primary" />
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
            {t('gamification.title')}
          </h1>
          <ProBadge />
        </div>
      </header>

      {/* Locked state for non-Pro users */}
      {!profileLoading && !hasProAccess ? (
        <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-6 text-center space-y-4">
          <div className="bg-primary/20 rounded-full size-16 flex items-center justify-center mx-auto">
            <Lock className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">{t('gamification.page.lockedTitle')}</h2>
          <p className="text-sm text-text-secondary">{t('gamification.page.lockedDescription')}</p>
          <Link
            href="/upgrade"
            className="inline-block px-6 py-3 rounded-[var(--radius-xl)] bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all duration-200 shadow-[var(--shadow-glow-sm)]"
          >
            {t('gamification.page.upgradeButton')}
          </Link>
        </div>
      ) : (
        <>
          {/* Loading state */}
          {isLoading && !profile && (
            <div className="space-y-4">
              <SkeletonCard lines={3} />
            </div>
          )}

          {/* Profile loaded */}
          {profile && (
            <>
              {/* Level header section */}
              <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-lg font-extrabold text-primary">{profile.level}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-text-primary">
                      {profile.levelTitle}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {t('gamification.profileCard.level', { level: profile.level })}
                    </p>
                  </div>
                </div>

                {/* XP progress bar */}
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-surface-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${xpProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-text-primary">
                      {t('gamification.profileCard.xp', {
                        current: profile.totalXp.toLocaleString(),
                        next: profile.xpForNextLevel.toLocaleString(),
                      })}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {t('gamification.profileCard.totalXp', {
                        total: profile.totalXp.toLocaleString(),
                      })}
                    </p>
                  </div>
                </div>

                {/* Earned count */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-text-secondary">
                    {t('gamification.profileCard.earned', {
                      count: profile.achievementsEarned,
                      total: profile.achievementsTotal,
                    })}
                  </span>
                </div>
              </div>

              {/* Achievement grid by category */}
              <div className="space-y-6 mt-6">
                {achievementsByCategory.map((category) => (
                  <AchievementCategorySection
                    key={category.key}
                    category={category}
                    t={t}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
