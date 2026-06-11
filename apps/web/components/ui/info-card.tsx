import { Sparkles, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface InfoCardProps {
  icon?: LucideIcon
  title: string
  desc?: string
  trailing?: ReactNode
}

/** Kit info card: primary-tinted bordered row with leading icon, title, and description. */
export function InfoCard({ icon: Icon = Sparkles, title, desc, trailing }: Readonly<InfoCardProps>) {
  return (
    <div
      className="flex items-center rounded-[18px]"
      style={{
        padding: '16px 18px',
        gap: 14,
        background: 'rgba(var(--primary-rgb), 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
      }}
    >
      <Icon
        size={24}
        strokeWidth={1.9}
        className="shrink-0 text-[var(--primary-soft)]"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {title}
        </div>
        {desc ? (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5,
              color: 'var(--fg-3)',
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            {desc}
          </div>
        ) : null}
      </div>
      {trailing}
    </div>
  )
}
