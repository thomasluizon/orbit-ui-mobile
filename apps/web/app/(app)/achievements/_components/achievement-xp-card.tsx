'use client'

import { useTranslations } from 'next-intl'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import { ProgressBar } from '@/components/ui/progress-bar'

interface AchievementXpCardProps {
  profile: GamificationProfile
  xpProgress: number
  formatNum: (n: number) => string
}

export function AchievementXpCard({
  profile,
  xpProgress,
  formatNum,
}: Readonly<AchievementXpCardProps>) {
  const t = useTranslations()

  return (
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
  )
}
