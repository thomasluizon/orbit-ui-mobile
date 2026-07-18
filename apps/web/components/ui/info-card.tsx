import { Info, type LucideIcon } from '@/components/ui/icons'
import type { ReactNode } from 'react'

const toneSurface = {
  quiet: { background: 'var(--bg-elev)', iconClass: 'text-[var(--fg-3)]' },
  accent: {
    background: 'rgba(var(--primary-rgb), 0.14)',
    iconClass: 'text-[var(--primary-soft)]',
  },
} as const

/** How loudly an aside asserts itself: `quiet` recedes onto the elevated surface,
 *  `accent` is reserved for a call-out that is the focal element of its surface. */
export type InfoCardTone = keyof typeof toneSurface

interface InfoCardProps {
  icon?: LucideIcon
  title: string
  desc?: string
  tone?: InfoCardTone
  trailing?: ReactNode
}

/** Kit info card: a borderless tonal aside. Title and description sit on the type-role
 *  scale so supporting copy recedes through colour and weight rather than through a ring. */
export function InfoCard({
  icon: Icon = Info,
  title,
  desc,
  tone = 'quiet',
  trailing,
}: Readonly<InfoCardProps>) {
  const surface = toneSurface[tone]

  return (
    <div
      data-info-card=""
      data-tone={tone}
      className={`flex rounded-[18px] ${desc ? 'items-start' : 'items-center'}`}
      style={{ padding: '16px 20px', gap: 12, background: surface.background }}
    >
      <Icon
        size={22}
        strokeWidth={1.8}
        className={`shrink-0 ${surface.iconClass}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="t-body m-0 font-medium text-balance">{title}</div>
        {desc ? (
          <p className="t-secondary m-0 max-w-[65ch] text-pretty" style={{ marginTop: 4 }}>
            {desc}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}
