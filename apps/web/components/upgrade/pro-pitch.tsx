import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Calendar, Eye, FileText } from '@/components/ui/icons'
import { plural } from '@/lib/plural'
const OUTCOMES = [
  { key: 'calendar', Icon: Calendar },
  { key: 'retrospective', Icon: FileText },
  { key: 'noticing', Icon: Eye },
] as const

export function ProPitch({ profile, trialDaysLeft, t, focusOnMount = false, titleKey, bodyKey, headingId, dateHint }: Readonly<{ profile: { isTrialActive?: boolean } | null; trialDaysLeft: number | null; t: ReturnType<typeof useTranslations>; focusOnMount?: boolean; titleKey?: string; bodyKey?: string; headingId?: string; dateHint?: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [focusOnMount])
  const trialActive = !!profile?.isTrialActive
  let eyebrow: string
  if (!trialActive) {
    eyebrow = t('upgrade.convert.freeEyebrow')
  } else if (trialDaysLeft === null) {
    eyebrow = t('upgrade.convert.trialEyebrow')
  } else if (trialDaysLeft <= 1) {
    eyebrow = t('upgrade.convert.trialLastDay')
  } else {
    eyebrow = plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
  }
  const heading = titleKey ? t(titleKey) : trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  const Heading = headingId ? 'h1' : 'h2'
  return (<div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)]">
          {eyebrow}
        </p>
        <Heading translate={titleKey ? 'no' : undefined} id={headingId} ref={headingRef} tabIndex={-1} className="t-display-heading text-pretty">
          {heading}
        </Heading>
        <p className="t-body max-w-[46ch] text-pretty" style={{ color: 'var(--fg-2)' }}>
          {t(bodyKey ?? 'upgrade.convert.promise')}
        </p>
        {!trialActive ? (
          <p className="text-sm leading-[1.55] text-[var(--fg-3)]">
            {t('upgrade.convert.trustLine')}
          </p>
        ) : null}
        {dateHint ? <p className="text-sm leading-[1.55] text-[var(--fg-3)]">{dateHint}</p> : null}
      </header>

      <section className="flex flex-col gap-3" aria-label={t('upgrade.convert.allowanceLabel')}>
        <div className="grid grid-cols-[1fr_1px_1fr] gap-4 rounded-[var(--r-card)] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)] sm:p-6">
          <Allowance amount={t('upgrade.convert.freeAllowance')} label={t('upgrade.free')} perDay={t('upgrade.convert.perDay')} />
          <span aria-hidden="true" className="h-full w-px bg-[var(--hairline)]" />
          <Allowance amount={t('upgrade.convert.proAllowance')} label="Pro" perDay={t('upgrade.convert.perDay')} />
        </div>
        <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
          {t('upgrade.convert.allowanceNote')}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-label={t('upgrade.outcomes.label')}>
        {OUTCOMES.map(({ key, Icon }) => (
          <div key={key} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-1 grid size-6 shrink-0 place-items-center text-[var(--fg-3)]">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">
                {t(`upgrade.outcomes.${key}.title`)}
              </h3>
              <p className="text-pretty text-sm leading-[1.5] text-[var(--fg-3)]">
                {t(`upgrade.outcomes.${key}.body`)}
              </p>
            </div>
          </div>
        ))}
      </section>

  </div>)
}

function Allowance({ amount, label, perDay }: Readonly<{ amount: string; label: string; perDay: string }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)]">{label}</p>
      <p className="t-allowance">
        {amount}
      </p>
      <p className="text-sm leading-[1.4] text-[var(--fg-3)]">{perDay}</p>
    </div>
  )
}
