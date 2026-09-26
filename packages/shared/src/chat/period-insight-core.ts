import type { PeriodInsightCard } from '../types/chat'

export type InsightPage = Readonly<{
  titleKey: string
  text?: string
}>

export function getInsightPages(card: PeriodInsightCard): readonly [InsightPage, ...InsightPage[]] {
  const pages: [InsightPage, ...InsightPage[]] = [{ titleKey: 'chat.insight.overview' }]
  const sections = [
    { titleKey: 'chat.insight.highlights', text: card.narrative.highlights },
    { titleKey: 'chat.insight.trends', text: card.narrative.trends },
    { titleKey: 'chat.insight.suggestion', text: card.narrative.suggestion },
    { titleKey: 'chat.insight.missed', text: card.narrative.missed },
  ]
  for (const section of sections) {
    if (pages.length === 4) break
    if (section.text.trim()) pages.push(section)
  }
  return pages
}
