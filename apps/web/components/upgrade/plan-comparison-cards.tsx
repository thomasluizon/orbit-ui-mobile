import { Check, X as XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { UPGRADE_FEATURE_CATEGORIES } from '@orbit/shared/utils/upgrade'

const UPGRADE_FEATURES = UPGRADE_FEATURE_CATEGORIES.flatMap((category) => category.features)

function PlanColumnRow({ feature, plan, t }: Readonly<{
  feature: (typeof UPGRADE_FEATURES)[number]
  plan: 'free' | 'pro'
  t: ReturnType<typeof useTranslations>
}>) {
  const included = feature.type === 'text' ? true : (plan === 'free' ? !!feature.freeEnabled : !!feature.proEnabled)
  const text = feature.type === 'text'
    ? t(`upgrade.features.${feature.key}.${plan}`)
    : t(`upgrade.features.${feature.key}.label`)

  const checkColor = plan === 'pro' ? 'var(--primary)' : 'var(--fg-3)'
  const textColor = included ? (plan === 'pro' ? 'var(--fg-1)' : 'var(--fg-2)') : 'var(--fg-4)'

  return (
    <li className="flex items-center" style={{ gap: 9, minHeight: 34 }}>
      {included
        ? <Check size={15} strokeWidth={2.4} className="shrink-0" style={{ color: checkColor }} aria-hidden="true" />
        : <XIcon size={15} strokeWidth={1.8} className="shrink-0" style={{ color: 'var(--fg-4)' }} aria-hidden="true" />}
      <span
        className="min-w-0 truncate"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.4, color: textColor }}
      >
        {text}
      </span>
    </li>
  )
}

function PlanColumn({ plan, t }: Readonly<{ plan: 'free' | 'pro'; t: ReturnType<typeof useTranslations> }>) {
  const isPro = plan === 'pro'
  return (
    <div
      className="rounded-[18px]"
      style={{
        padding: '16px 14px',
        background: isPro ? 'rgba(var(--primary-rgb), 0.04)' : 'var(--bg-card)',
        boxShadow: isPro
          ? 'inset 0 0 0 1.5px var(--primary), var(--primary-glow)'
          : 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex items-center" style={{ gap: 8, minHeight: 26, marginBottom: 14 }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: isPro ? 'var(--primary-soft)' : 'var(--fg-1)',
          }}
        >
          {isPro ? t('common.proBadge') : t('upgrade.free')}
        </span>
        {isPro && (
          <span
            className="inline-flex items-center rounded-full uppercase"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.05em',
              padding: '3px 8px',
              background: 'rgba(var(--primary-rgb), 0.16)',
              color: 'var(--primary-soft)',
            }}
          >
            {t('upgrade.recommended')}
          </span>
        )}
      </div>
      <ul className="flex flex-col" style={{ gap: 8 }}>
        {UPGRADE_FEATURES.map((feature) => (
          <PlanColumnRow key={feature.key} feature={feature} plan={plan} t={t} />
        ))}
      </ul>
    </div>
  )
}

export function PlanComparisonCards({ t }: Readonly<{ t: ReturnType<typeof useTranslations> }>) {
  return (
    <div className="grid grid-cols-2 items-start" style={{ gap: 10, marginTop: 28 }}>
      <PlanColumn plan="free" t={t} />
      <PlanColumn plan="pro" t={t} />
    </div>
  )
}
