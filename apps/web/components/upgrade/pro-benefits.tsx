import type { useTranslations } from 'next-intl'
import { Calendar, Eye, FileText, MessageCircle } from '@/components/ui/icons'

const OUTCOMES = [
  { key: 'astra', Icon: MessageCircle },
  { key: 'calendar', Icon: Calendar },
  { key: 'retrospective', Icon: FileText },
  { key: 'noticing', Icon: Eye },
] as const

export function ProBenefits({ t, heading = false }: Readonly<{
  t: ReturnType<typeof useTranslations>
  heading?: boolean
}>) {
  return (
    <section className="flex flex-col gap-4">
      {heading ? <h2 className="t-h2 text-[var(--fg-1)]">{t('upgrade.included')}</h2> : null}
      <ul aria-label={t(heading ? 'upgrade.included' : 'upgrade.outcomes.label')} className="flex flex-col gap-3 py-2">
        {OUTCOMES.map(({ key, Icon }) => <li key={key} className="flex items-start gap-3">
          <span aria-hidden="true" className="shrink-0 text-[var(--fg-3)]"><Icon size={20} strokeWidth={1.5} /></span>
          <p translate={key === 'astra' || key === 'noticing' ? 'no' : undefined} className="min-w-0 max-w-[65ch] text-pretty text-sm leading-[1.5] text-[var(--fg-2)]">{t(`upgrade.outcomes.${key}`)}</p>
        </li>)}
      </ul>
    </section>
  )
}
