'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { BlockFrame } from './read-block-frame'
import type { PeriodComparisonCard as PeriodComparison } from '@orbit/shared/types/chat'

export function PeriodComparisonCard({ card }: Readonly<{ card: PeriodComparison }>) {
  const t = useTranslations()
  const locale = useLocale()
  const number = new Intl.NumberFormat(locale)
  const delta = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }).format(card.absoluteDelta)
  const relative = card.baselineValue !== 0 && card.relativeDelta != null ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(card.relativeDelta) : null
  return <BlockFrame state="resting" title={t(`chat.readBlock.metric.${card.metric}`)} wrapTitle count={null}
    items={[
      { id: 'current', wrapLabel: true, label: formatReadWindow(card.current.window, locale), control: <span className="tabular-nums">{number.format(card.currentValue)}</span> },
      { id: 'baseline', wrapLabel: true, label: formatReadWindow(card.baseline.window, locale), control: <span className="tabular-nums">{number.format(card.baselineValue)}</span> },
      { id: 'delta', wrapLabel: true, label: t('chat.readBlock.delta'), control: <span className="tabular-nums">{delta}{relative ? ` (${relative})` : ''}</span> },
    ]}
    body={<p className="text-sm text-[var(--fg-3)]">{t(`chat.readBlock.unit.${card.unit}`, { count: card.currentValue })}</p>} />
}
