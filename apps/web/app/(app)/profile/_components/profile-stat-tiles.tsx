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
      className="relative flex flex-1 cursor-pointer appearance-none rounded-[18px] border-0 bg-transparent p-0 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
    >
      {children}
    </button>
  )
}

interface ProfileStatTilesProps {
  streak: number
  isLoading: boolean
  onStreakClick: () => void
}

function StatTileSkeleton() {
  return (
    <div
      className="flex-1 animate-pulse rounded-[18px] bg-[var(--bg-elev)]"
      style={{ height: 110 }}
    />
  )
}

export function ProfileStatTiles({
  streak,
  isLoading,
  onStreakClick,
}: Readonly<ProfileStatTilesProps>) {
  const t = useTranslations()

  const streakLabel = t('streakDisplay.title')
  const streakValue = `${streak} ${plural(t('streakDisplay.daysSuffix'), streak)}`
  if (isLoading) {
    return (
      <div className="flex px-5" style={{ gap: 14, marginTop: 24, marginBottom: 18 }}>
        <StatTileSkeleton />
      </div>
    )
  }

  return (
    <div className="flex px-5" style={{ gap: 14, marginTop: 24, marginBottom: 18 }}>
      <StatTileButton
        dataTour="tour-profile-streak"
        ariaLabel={`${streakValue} · ${streakLabel}`}
        onClick={onStreakClick}
      >
        <StatTile  value={streakValue} label={streakLabel} />
      </StatTileButton>
    </div>
  )
}
