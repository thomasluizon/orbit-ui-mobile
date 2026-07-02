'use client'

import { Check, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'

export type PlanCardVariant = 'free' | 'hero' | 'anchor'

interface PlanCardProps {
  variant: PlanCardVariant
  name: string
  badge?: string
  price: string
  period: string
  sub?: string
  heroLine?: string
  features?: string[]
  ctaLabel: string
  onCta: () => void
  busy?: boolean
  ctaTestId?: string
}

const cardOrder: Record<PlanCardVariant, string> = {
  hero: 'order-1 md:order-2',
  free: 'order-2 md:order-1',
  anchor: 'order-3',
}

const surface: Record<PlanCardVariant, string> = {
  hero: 'z-10 bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1.5px_var(--primary),var(--primary-glow)] md:-translate-y-3',
  free: 'bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline)]',
  anchor: 'bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline)]',
}

/** Upgrade chooser card: muted Free, violet-lit yearly hero, or outline monthly anchor, each carrying its own CTA. */
export function PlanCard({
  variant,
  name,
  badge,
  price,
  period,
  sub,
  heroLine,
  features = [],
  ctaLabel,
  onCta,
  busy = false,
  ctaTestId,
}: Readonly<PlanCardProps>) {
  const isHero = variant === 'hero'

  return (
    <div className={['flex h-full flex-col rounded-[18px] p-[22px]', cardOrder[variant], surface[variant]].join(' ')}>
      <div className="flex flex-wrap items-center gap-2" style={{ minHeight: 24 }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            color: isHero ? 'var(--primary-soft)' : 'var(--fg-1)',
          }}
        >
          {name}
        </span>
        {badge ? <Badge>{badge}</Badge> : null}
      </div>

      <div className="flex items-baseline gap-1" style={{ marginTop: 14 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--fg-1)',
          }}
        >
          {price}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-3)' }}>{period}</span>
      </div>

      {sub ? (
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-3)' }}>
          {sub}
        </p>
      ) : null}

      {heroLine ? (
        <div
          className="flex items-start gap-2"
          style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}
        >
          <Sparkles size={15} strokeWidth={1.8} className="shrink-0 text-[var(--primary-soft)]" style={{ marginTop: 1 }} aria-hidden="true" />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-2)' }}>{heroLine}</span>
        </div>
      ) : null}

      {features.length > 0 ? (
        <ul className="flex flex-col" style={{ marginTop: 16, gap: 10 }}>
          {features.map((feature) => (
            <li key={feature} className="flex items-center" style={{ gap: 8 }}>
              <Check size={14} strokeWidth={2.4} className="shrink-0 text-[var(--primary-soft)]" aria-hidden="true" />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-2)' }}>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ marginTop: 'auto', paddingTop: 20 }}>
        <PillButton
          variant={isHero ? 'primary' : 'ghost'}
          fullWidth
          busy={busy}
          disabled={busy}
          onClick={onCta}
          dataTestId={ctaTestId}
        >
          {ctaLabel}
        </PillButton>
      </div>
    </div>
  )
}
