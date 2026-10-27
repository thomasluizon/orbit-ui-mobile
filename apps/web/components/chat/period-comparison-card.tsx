'use client'

import { useLocale, useTranslations } from 'next-intl'
import { comparisonPresentation } from '@orbit/shared/chat/figure-card-core'
import { BlockFrame } from './read-block-frame'
import { CompactFigure, FigureList } from './compact-figure'
import type { PeriodComparisonCard as PeriodComparison } from '@orbit/shared/types/chat'

export function PeriodComparisonCard({ card }: Readonly<{ card: PeriodComparison }>) {
  const t = useTranslations()
  const locale = useLocale()
  const presentation = comparisonPresentation(card, locale, t)
  return <BlockFrame state="resting" title={presentation.verdict} wrapTitle count={null} items={[]}
    body={<FigureList>
      <p className="text-sm text-[var(--fg-2)]">{t(`chat.readBlock.metric.${card.metric}`)}</p>
      {presentation.bars.map(bar => <div key={bar.id} className="flex min-w-0 flex-col gap-1">
        <p className="text-xs text-[var(--fg-3)]">{bar.label}</p>
        <CompactFigure value={new Intl.NumberFormat(locale).format(bar.value)} unit={t(`chat.readBlock.unit.${card.unit}`, { count: bar.value })} />
        <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-[8px] bg-[var(--track-empty)]"><div data-comparison-bar={bar.id} className="h-full rounded-[8px] bg-[var(--fg-2)]" style={{ width: `${bar.width}%` }} /></div>
      </div>)}
    </FigureList>} />
}
