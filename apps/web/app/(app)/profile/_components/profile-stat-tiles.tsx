'use client'

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
      className="flex flex-1 cursor-pointer appearance-none rounded-[18px] border-0 bg-transparent p-0 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
    >
      {children}
    </button>
  )
}

interface ProfileStatTilesProps {
  streak: number
  achievementsEarned: number
  showAchievements: boolean
  achievementsDataTour?: string
  onStreakClick: () => void
  onAchievementsClick: () => void
}

export function ProfileStatTiles({
  streak,
  achievementsEarned,
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
            value={achievementsEarned}
            label={t('gamification.profileCard.tileLabel')}
          />
        </StatTileButton>
      )}
    </div>
  )
}
