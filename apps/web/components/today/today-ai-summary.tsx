'use client'

import { useLocale, useTranslations } from 'next-intl'
import { getSummaryFirstSentence } from '@orbit/shared/utils'
import { useFlag } from '@/hooks/use-flag'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-summary'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { TodayAstraLine } from './today-astra-line'

export function TodayAISummary({ date }: Readonly<{ date: string }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const { profile } = useProfile()
  if (!profile || (profile.hasProAccess && !profile.aiSummaryEnabled)) return null
  if (profile.hasProAccess) return <DailySummary key={date} date={date} language={profile.language} timeZone={profile.timeZone} />
  return <TodayAstraLine text={t(guided ? 'summary.guided.freePrompt' : 'summary.freePrompt')} destination={t('summary.upgrade')}
    href="/upgrade" />
}

function DailySummary({ date, language, timeZone }: Readonly<{ date: string; language: string | null; timeZone: string | null }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { summary, isLoading, isFetching, error, refetch } = useSummary({
    date, locale: language ?? locale, timeZone, hasProAccess: true, aiSummaryEnabled: true,
  })
  if (isLoading || error) return <TodayAstraLine announce
    text={isLoading ? t('summary.loading') : t('summary.error')}
    destination={isLoading ? t('summary.loading') : t('summary.retry')}
    loading={isLoading} busy={isLoading || isFetching} disabled={isLoading || isFetching}
    onPress={() => void refetch()} />
  if (!summary) return null
  return <TodayAstraLine announce text={getSummaryFirstSentence(summary)} destination={t('todayAstra.openConversation')} busy={isFetching}
    onPress={() => {
      useChatStore.getState().openDailySummary(date, summary)
      useUIStore.getState().setAstraConversationOpen(true)
    }} />
}
