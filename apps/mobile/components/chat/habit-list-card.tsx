import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown } from '@/components/ui/icons'
import { HabitBlockRow } from './habit-block-row'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslation } from 'react-i18next'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { habitListOccurrenceFilters, habitListReadControl, habitListRowState } from '@orbit/shared/chat/habit-list-core'
import { formatAPIDate } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { HabitCheck } from '@/components/habits/habit-check'

import { useHabits, useLogHabit } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const PAGE_SIZE = 20

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const { t } = useTranslation()
  const navigate = useChatNavigation()
  const logHabit = useLogHabit()
  const readScope = useReadActionScope()
  const [today] = useState(() => formatAPIDate(new Date()))
  const occurrenceDate = habitList.date ?? today
  const occurrences = useHabits(habitListOccurrenceFilters(occurrenceDate))
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [shownCount, setShownCount] = useState(PAGE_SIZE)
  const visibleItems = habitList.items.slice(0, shownCount)
  const rows = visibleItems.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const { control, logged, unavailable } = habitListRowState(item, occurrence, Boolean(habitList.read), occurrenceDate, logHabit.isPending, readScope)
    return <HabitBlockRow key={item.id} title={item.title} emoji={item.emoji}
      label={t('chat.habitList.open', { name: item.title })}
      onOpen={() => navigate({ pathname: '/habits/[id]', params: { id: item.id, ...(habitList.date ? { date: habitList.date } : {}) } })}
      control={occurrence ? (
        <Pressable disabled={unavailable} accessibilityRole="button" accessibilityLabel={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} onPress={() => {
          if (unavailable || !habitListReadControl(occurrence, item.status, occurrenceDate, readScope).writeAllowed) return
          logHabit.mutate({ habitId: item.id, date: occurrenceDate, intent: logged ? 'unlog' : 'log' })
        }} style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' }}>
          <HabitCheck status={control.status} label={t(control.statusKey)} />
        </Pressable>
      ) : undefined} />
  })

  return (
    <View style={{ width: '100%' }}>
      <BlockFrame state="resting" title={t(habitList.read ? 'nav.habits' : habitList.scope === 'all' ? 'chat.habitList.allTitle' : 'chat.habitList.title')} count={habitList.items.length === 0 ? null : t('chat.habitList.count', { shown: visibleItems.length, total: habitList.totalCount ?? habitList.items.length })} items={[]} body={habitList.items.length === 0 ? (
        <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14 }}>{t(habitList.read || habitList.scope === 'all' ? 'chat.habitList.allEmpty' : 'chat.habitList.todayEmpty')}</Text>
      ) : <View style={{ gap: 8 }}>{rows}</View>} actions={visibleItems.length < habitList.items.length ? (
        <IconButton label={t('chat.habitList.more')} onClick={() => setShownCount((count) => count + PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      ) : undefined} />
    </View>
  )
}
