'use client'

import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PlanCardProps {
  name: string
  badge?: string
  price: string
  sub?: string
  features?: string[]
  selected: boolean
  onSelect: () => void
}

/** Kit plan card: selectable radio card with name, badge, Inter price, and feature checklist. */
export function PlanCard({
  name,
  badge,
  price,
  sub,
  features = [],
  selected,
  onSelect,
}: Readonly<PlanCardProps>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        'block w-full cursor-pointer appearance-none rounded-[18px] border-0 text-left transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]',
        selected
          ? 'bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1.5px_var(--primary)] hover:shadow-[inset_0_0_0_1.5px_var(--primary),var(--shadow-1)]'
          : 'bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-elev)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong),var(--shadow-1)]',
      ].join(' ')}
      style={{ padding: '18px 18px 20px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {name}
            </span>
            {badge ? <Badge>{badge}</Badge> : null}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--fg-1)',
            }}
          >
            {price}
          </div>
          {sub ? (
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
                marginTop: 2,
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 24,
            height: 24,
            background: selected ? 'var(--primary)' : 'transparent',
            boxShadow: selected ? 'none' : 'inset 0 0 0 2px var(--fg-4)',
          }}
          aria-hidden="true"
        >
          {selected ? (
            <span
              className="rounded-full"
              style={{ width: 9, height: 9, background: 'var(--fg-on-primary)' }}
            />
          ) : null}
        </span>
      </div>
      {features.length > 0 ? (
        <div className="flex flex-col" style={{ marginTop: 14, gap: 9 }}>
          {features.map((feature) => (
            <div key={feature} className="flex items-center" style={{ gap: 10 }}>
              <Check
                size={16}
                strokeWidth={2.4}
                className="shrink-0 text-[var(--primary-soft)]"
                aria-hidden="true"
              />
              <span
                style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
              >
                {feature}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </button>
  )
}
