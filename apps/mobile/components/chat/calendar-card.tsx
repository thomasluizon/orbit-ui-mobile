import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import type { CalendarCard as CalendarCardData } from '@orbit/shared/types/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function CalendarCard({ calendarCard }: Readonly<{ calendarCard: CalendarCardData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const time = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' })
  const items: BlockFrameItem[] = calendarCard.events.map((event, index) => ({
    id: `event-${index}`,
    label: event.title,
    wrapLabel: true,
    meta: event.isAllDay ? t('chat.calendarCard.allDay') : time.format(new Date(event.start)),
  }))
  if (calendarCard.sync) {
    const failed = calendarCard.sync.enabled && calendarCard.sync.status !== 'Idle'
    items.push({
      id: 'sync', label: t('chat.calendarCard.sync'),
      meta: failed ? undefined : t(calendarCard.sync.enabled ? `chat.calendarCard.syncState.${calendarCard.sync.status}` : 'chat.calendarCard.syncState.disabled'),
      ...(failed ? { status: 'failed' as const, statusLabel: t(`chat.calendarCard.syncState.${calendarCard.sync.status}`) } : {}),
    })
  }
  return <View style={{ width: '100%', marginTop: 8 }}>
    <BlockFrame state="resting" title={t('chat.calendarCard.title')} count={calendarCard.events.length} items={items}
      body={calendarCard.events.length === 0 ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.calendarCard.empty')}</Text> : undefined}
      actions={<Button variant="ghost" size="sm" onClick={() => router.push('/calendar')}>{t('chat.calendarCard.open')}</Button>} />
  </View>
}
