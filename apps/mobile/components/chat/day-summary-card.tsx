import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function DaySummaryCard({ daySummary }: Readonly<{ daySummary: DaySummaryCardData }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const figure = (value: number) => <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16 }}>{value}</Text>
  const rows = daySummary.due === 0
    ? [{ id: 'due', label: t('chat.daySummary.nothingDue') }]
    : [
        { id: 'due', label: t('chat.daySummary.doneOfDue', { done: daySummary.done, due: daySummary.due }) },
        { id: 'overdue', label: t('chat.daySummary.overdue'), control: figure(daySummary.overdueCount) },
      ]
  rows.push({ id: 'streak', label: t('chat.daySummary.streak'), control: figure(daySummary.currentStreak) })
  return <View style={{ width: '100%', marginTop: 8 }}>
    <BlockFrame state="resting" title={t('chat.daySummary.title')} count={null} items={rows}
      body={daySummary.due > 0 && daySummary.completionRate != null
        ? <ProgressRing value={daySummary.completionRate} label={t('chat.daySummary.ring', { done: daySummary.done, due: daySummary.due })} />
        : undefined}
      actions={<Button variant="ghost" size="sm" onClick={() => router.push('/')}>{t('chat.daySummary.open')}</Button>} />
  </View>
}
