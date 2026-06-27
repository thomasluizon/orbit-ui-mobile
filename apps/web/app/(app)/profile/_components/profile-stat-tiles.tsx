'use client'

import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { StatTile } from '@/components/ui/stat-tile'
import { plural } from '@/lib/plural'

function StatTileButton({
  onClick,
  ariaLabel,
  dataTour,
  children,
}: Readonly<{
  onClick: () => void
  ariaLabel: string
  dataTour?: string
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      aria-label={ariaLabel}
      onClick={onClick}
      className="relative flex flex-1 cursor-pointer appearance-none rounded-[18px] border-0 bg-transparent p-0 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
    >
      {children}
    </button>
  )
}

interface ProfileStatTilesProps {
  streak: number
  achievementsValue: number
  achievementsLocked: boolean
  showAchievements: boolean
  achievementsDataTour?: string
  onStreakClick: () => void
  onAchievementsClick: () => void
}

export function ProfileStatTiles({
  streak,
  achievementsValue,
  achievementsLocked,
  showAchievements,
  achievementsDataTour,
  onStreakClick,
  onAchievementsClick,
}: Readonly<ProfileStatTilesProps>) {
  const t = useTranslations()

  return (
    <div className="flex px-5" style={{ gap: 14, marginTop: 24 }}>
      <StatTileButton
        dataTour="tour-profile-streak"
        ariaLabel={t('streakDisplay.title')}
        onClick={onStreakClick}
      >
        <StatTile
          emoji="🔥"
          value={`${streak} ${plural(t('streakDisplay.daysSuffix'), streak)}`}
          label={t('streakDisplay.title')}
        />
      </StatTileButton>
      {showAchievements && (
        <StatTileButton
          dataTour={achievementsDataTour}
          ariaLabel={t('gamification.profileCard.tileLabel')}
          onClick={onAchievementsClick}
        >
          <StatTile
            emoji="🏆"
            value={achievementsValue}
            label={t('gamification.profileCard.tileLabel')}
          />
          {achievementsLocked && (
            <span
              aria-hidden="true"
              className="absolute flex items-center justify-center rounded-full"
              style={{
                top: 10,
                right: 10,
                width: 22,
                height: 22,
                background: 'rgba(var(--primary-rgb), 0.12)',
              }}
            >
              <Lock size={12} strokeWidth={2} color="var(--primary)" />
            </span>
          )}
        </StatTileButton>
      )}
    </div>
  )
}
