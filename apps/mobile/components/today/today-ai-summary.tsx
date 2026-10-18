import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { getSummaryFirstSentence } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-summary'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { TodayAstraLine } from './today-astra-line'

export function TodayAISummary({ date }: Readonly<{ date: string }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  if (!profile || (profile.hasProAccess && !profile.aiSummaryEnabled)) return null
  if (profile.hasProAccess) return <DailySummary key={date} date={date} language={profile.language} timeZone={profile.timeZone} />
  return <TodayAstraLine text={t('summary.freePrompt')} destination={t('summary.upgrade')}
    role="link" onPress={() => router.push('/upgrade')} />
}

function DailySummary({ date, language, timeZone }: Readonly<{ date: string; language: string | null; timeZone: string | null }>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { summary, isLoading, isFetching, error, refetch } = useSummary({
    date, locale: language ?? locale, timeZone, hasProAccess: true, aiSummaryEnabled: true,
  })
  if (isLoading || error) return <TodayAstraLine
    text={isLoading ? t('summary.loading') : t('summary.error')}
    destination={isLoading ? t('summary.loading') : t('summary.retry')}
    busy={isLoading || isFetching} disabled={isLoading || isFetching}
    onPress={() => void refetch()} />
  if (!summary) return null
  return <TodayAstraLine text={getSummaryFirstSentence(summary)} destination={t('todayAstra.openConversation')} busy={isFetching}
    onPress={() => {
      useChatStore.getState().openDailySummary(date, summary)
      useUIStore.getState().setAstraConversationOpen(true)
    }} />
}
