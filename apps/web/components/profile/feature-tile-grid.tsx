'use client'

import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'
import {
  isProfileNavItemLocked,
  type ProfileNavIconKey,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import type { Profile } from '@orbit/shared/types/profile'
import { Badge } from '@/components/ui/badge'
import { ProfileNavIcon } from './profile-nav-icon'

type FeatureTileGridProfile = Pick<
  Profile,
  'hasProAccess' | 'isLifetimePro' | 'subscriptionInterval'
>

interface FeatureTileGridProps {
  items: ProfileNavItem[]
  profile: FeatureTileGridProfile | null | undefined
  onItemSelect: (item: ProfileNavItem) => void
  onTourReplay: () => void
  dataTourMap?: Record<string, string>
}

/**
 * 2-column icon-tile grid of feature destinations: kit stat-tile affordance
 * (radius 18, translucent fill, inset hairline ring) with a 22/1.8 icon, a Rubik
 * label, and a lock badge or PRO pill on gated items. Leads with the tour-replay
 * tile. Fed by the PROFILE_NAV_ITEMS features config on both the /explore route
 * and the phone-width Profile Features section.
 */
export function FeatureTileGrid({
  items,
  profile,
  onItemSelect,
  onTourReplay,
  dataTourMap,
}: Readonly<FeatureTileGridProps>) {
  const t = useTranslations()

  return (
    <div className="grid grid-cols-2" style={{ gap: 14 }}>
      <FeatureTile
        iconKey="compass"
        label={t('tour.replay.title')}
        lockedLabel={t('common.locked')}
        onClick={onTourReplay}
      />
      {items.map((item) => (
        <FeatureTile
          key={item.id}
          iconKey={item.iconKey}
          label={t(item.titleKey)}
          locked={isProfileNavItemLocked(item, profile)}
          proBadge={item.proBadge}
          proBadgeLabel={t('common.proBadge')}
          lockedLabel={t('common.locked')}
          dataTour={dataTourMap?.[item.id]}
          onClick={() => onItemSelect(item)}
        />
      ))}
    </div>
  )
}

function FeatureTile({
  iconKey,
  label,
  lockedLabel,
  locked = false,
  proBadge = false,
  proBadgeLabel,
  dataTour,
  onClick,
}: Readonly<{
  iconKey: ProfileNavIconKey
  label: string
  lockedLabel: string
  locked?: boolean
  proBadge?: boolean
  proBadgeLabel?: string
  dataTour?: string
  onClick: () => void
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={dataTour}
      className="relative flex cursor-pointer appearance-none flex-col items-center justify-center rounded-[18px] border-0 bg-[var(--bg-field)] transition-[background-color,transform] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-2)] active:scale-[0.98]"
      style={{
        gap: 8,
        minHeight: 96,
        padding: '18px 12px 16px',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <span aria-hidden="true" className="flex items-center justify-center">
        <ProfileNavIcon iconKey={iconKey} />
      </span>
      <span
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1.3,
          color: 'var(--fg-1)',
        }}
      >
        {label}
      </span>
      {locked && <span className="sr-only">{`, ${lockedLabel}`}</span>}
      {locked ? (
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
      ) : proBadge ? (
        <span aria-hidden="true" className="absolute" style={{ top: 10, right: 10 }}>
          <Badge>{proBadgeLabel}</Badge>
        </span>
      ) : null}
    </button>
  )
}
