'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatFigurePeriod } from '@orbit/shared/chat/figure-card-core'
import { CompactFigure } from './compact-figure'
import { BlockFrame } from './read-block-frame'
import type { PeriodTotalCard as PeriodTotal } from '@orbit/shared/types/chat'

export function PeriodTotalCard({ card }: Readonly<{ card: PeriodTotal }>) {
  const t = useTranslations()
  const locale = useLocale()
  return <BlockFrame state="resting" title={t(`chat.readBlock.metric.${card.metric}`)} wrapTitle titleContent={<CompactFigure value={new Intl.NumberFormat(locale).format(card.value)} unit={t(`chat.figure.totalUnit.${card.metric}`, { count: card.value })} />} count={null} items={[]}
    body={<div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-[var(--fg-3)]">{formatFigurePeriod(card.metrics.window, locale, t)}</p>
    </div>} />
}
