import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import type { TFunction } from 'i18next'
import {
  formatCalendarSyncRecurrenceLabel,
  type CalendarSyncEvent,
} from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { SelectCheck } from '@/components/ui/select-check'
import type { CalendarSyncStyles } from './calendar-sync-styles'

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

interface CalendarSyncEventRowProps {
  event: CalendarSyncEvent
  index: number
  selected: boolean
  styles: CalendarSyncStyles
  tokens: AppTokensV2
  t: TFunction
  onToggle: (id: string) => void
}

export function CalendarSyncEventRow({
  event,
  index,
  selected,
  styles,
  tokens,
  t,
  onToggle,
}: Readonly<CalendarSyncEventRowProps>) {
  const recurrenceLabel = formatCalendarSyncRecurrenceLabel(
    event.recurrenceRule,
    {
      translate: (key, values) => t(key, values),
      pluralize: plural,
    },
  )
  const dateLabel = event.startDate ?? ''
  const timeLabel = event.startTime
    ? `${event.startTime}${event.endTime ? `-${event.endTime}` : ''}`
    : ''
  const meta = [
    dateLabel,
    timeLabel,
    event.isRecurring ? recurrenceLabel : null,
    event.calendarName ?? null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Animated.View entering={rowEntrance(index)}>
      <Pressable
        onPress={() => onToggle(event.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        style={({ pressed }) => [
          styles.eventRow,
          {
            borderBottomColor: tokens.hairline,
            backgroundColor: pressed
              ? tokens.bgElev
              : selected
                ? tintFromPrimary(tokens, 0.06)
                : 'transparent',
          },
        ]}
      >
        <View style={styles.eventBody}>
          <Text style={[styles.eventTitle, { color: tokens.fg1 }]} numberOfLines={1}>
            {event.title}
          </Text>
          {meta ? (
            <Text style={[styles.eventMeta, { color: tokens.fg3 }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <SelectCheck selected={selected} onPress={() => onToggle(event.id)} />
      </Pressable>
    </Animated.View>
  )
}
