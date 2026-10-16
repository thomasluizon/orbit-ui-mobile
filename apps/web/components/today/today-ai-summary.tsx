'use client'

import { useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AI_SUMMARY_CLAMP_CHARS } from '@orbit/shared/query'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-summary'
import { useUIStore } from '@/stores/ui-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Badge } from '@/components/ui/badge'
import { PillButton, PillLink } from '@/components/ui/pill-button'
import { ChevronsDown, ChevronsUp, RefreshCw } from '@/components/ui/icons'

export function TodayAISummary({ date }: Readonly<{ date: string }>) {
  const t = useTranslations()
  const { profile } = useProfile()
  if (!profile || (profile.hasProAccess && !profile.aiSummaryEnabled)) return null
  if (profile.hasProAccess) return <DailySummary key={date} date={date} language={profile.language} />
  return <SummarySection>
    <p className="max-w-[65ch] text-sm leading-[1.55] text-[var(--fg-2)]">{t('summary.freePrompt')}</p>
    <div className="flex"><PillLink href="/upgrade" variant="ghost">{t('summary.upgrade')}</PillLink></div>
  </SummarySection>
}

function SummarySection({ children, busy = false }: Readonly<{ children: React.ReactNode; busy?: boolean }>) {
  const t = useTranslations()
  return <section aria-busy={busy} aria-label={t('summary.title')} className="flex min-w-0 flex-col gap-3 px-4">
    <div className="flex items-center gap-2 text-[var(--fg-3)]">
      <AstraGlyph size={20} color="var(--fg-3)" />
      <h2 className="text-sm font-medium text-[var(--fg-2)]">{t('summary.title')}</h2>
      <Badge variant="outline">{t('aiDisclosure.isAiLabel')}</Badge>
    </div>
    {children}
  </section>
}

function DailySummary({ date, language }: Readonly<{ date: string; language: string | null }>) {
  const t = useTranslations()
  const locale = useLocale()
  const messageId = useId()
  const { summary, isLoading, isFetching, error, refetch } = useSummary({
    date, locale: language ?? locale, hasProAccess: true, aiSummaryEnabled: true,
  })
  if (!isLoading && !error && !summary) return null
  if (!isLoading && !error && summary) return <SummarySection><SummaryText summary={summary} busy={isFetching} /></SummarySection>
  return <SummarySection busy={isLoading || isFetching}>
    <div className="flex max-w-[65ch] flex-col gap-2 text-sm" style={isLoading ? { minHeight: '4.65em' } : undefined}>
      <p id={messageId} aria-live="polite" className="max-w-[65ch] text-sm leading-[1.55] text-[var(--fg-2)]">{isLoading ? t('summary.loading') : t('summary.error')}</p>
      {isLoading ? <div aria-hidden="true" className="flex flex-col gap-2"><span className="h-[14px] rounded-[8px] bg-[var(--bg-well)]" /><span className="h-[14px] w-2/3 rounded-[8px] bg-[var(--bg-well)]" /></div> : null}
    </div>
    <div className="flex">
      {error && !isLoading ? <PillButton variant="ghost" iconOnly label={t('summary.retry')} descriptionId={messageId} disabled={isFetching} onClick={() => void refetch()}><RefreshCw size={20} aria-hidden="true" /></PillButton>
        : <PillButton variant="ghost" iconOnly label={t('summary.askAstra')} descriptionId={messageId} disabled><AstraGlyph size={20} color="var(--fg-2)" /></PillButton>}
    </div>
  </SummarySection>
}

function SummaryText({ summary, busy }: Readonly<{ summary: string; busy: boolean }>) {
  const t = useTranslations()
  const summaryId = useId()
  const [expanded, setExpanded] = useState(false)
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const clampable = summary.length > AI_SUMMARY_CLAMP_CHARS
  return <>
    <p id={summaryId} className={`max-w-[65ch] break-words text-sm leading-[1.55] text-[var(--fg-2)] ${clampable && !expanded ? 'line-clamp-3' : ''}`}>{summary}</p>
    {expanded || !clampable ? <p className="max-w-[65ch] text-xs leading-[1.5] text-[var(--fg-3)]">{t('aiDisclosure.notMedicalAdvice')}</p> : null}
    <div className="flex flex-wrap items-center gap-3">
      {clampable ? <button type="button" aria-expanded={expanded} aria-controls={summaryId}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex min-h-[48px] items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-medium text-[var(--fg-2)] transition-none hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]">
        {expanded ? <ChevronsUp size={16} aria-hidden="true" /> : <ChevronsDown size={16} aria-hidden="true" />}
        {expanded ? t('common.seeLess') : t('common.seeMore')}
      </button> : null}
      <PillButton variant="ghost" iconOnly label={t('summary.askAstra')} disabled={busy} onClick={() => setConversationOpen(true)}><AstraGlyph size={20} color="var(--fg-2)" /></PillButton>
    </div>
  </>
}
