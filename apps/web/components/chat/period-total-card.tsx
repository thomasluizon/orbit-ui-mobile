'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { BlockFrame } from './read-block-frame'
import type { PeriodTotalCard as PeriodTotal } from '@orbit/shared/types/chat'

export function PeriodTotalCard({ card }: Readonly<{ card: PeriodTotal }>) {
  const t = useTranslations()
  const locale = useLocale()
  return <BlockFrame state="resting" title={t(`chat.readBlock.metric.${card.metric}`)} wrapTitle count={null} items={[]}
    body={<div className="flex min-w-0 flex-col gap-2">
      <p className="tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>{new Intl.NumberFormat(locale).format(card.value)}</p>
      <p className="text-sm text-[var(--fg-2)]">{t(`chat.readBlock.unit.${card.unit}`, { count: card.value })}</p>
      <p className="text-sm text-[var(--fg-3)]">{formatReadWindow(card.metrics.window, locale)}</p>
    </div>} />
}
