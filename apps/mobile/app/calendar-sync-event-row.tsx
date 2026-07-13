import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Bell, X } from 'lucide-react-native'
import type { TFunction } from 'i18next'
import {
  formatCalendarSyncRecurrenceLabel,
  type CalendarSyncEvent,
} from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { RadioGlyph } from '@/components/ui/select-check'
import { Badge } from '@/components/ui/badge'
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
  isReviewMode: boolean
  suggestionId: string | null
  dismissPending: boolean
  styles: CalendarSyncStyles
  tokens: AppTokensV2
  t: TFunction
  onToggle: (id: string) => void
  onDismiss: (suggestionId: string) => void
}

export function CalendarSyncEventRow({
  event,
  index,
  selected,
  isReviewMode,
  suggestionId,
  dismissPending,
  styles,
  tokens,
  t,
  onToggle,
  onDismiss,
}: Readonly<CalendarSyncEventRowProps>) {
  const recurrenceLabel = formatCalendarSyncRecurrenceLabel(
    event.recurrenceRule,
    {
      translate: (key, values) => t(key, values),
      pluralize: plural,
    },
  )
  const endTimeSuffix = event.endTime ? ` - ${event.endTime}` : ''
  const timeLabel = event.startTime ? `${event.startTime}${endTimeSuffix}` : ''
  const selectedBackground = selected ? tintFromPrimary(tokens, 0.06) : 'transparent'

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
            backgroundColor: pressed ? tokens.bgElev : selectedBackground,
          },
        ]}
      >
        <View style={styles.eventBody}>
          <Text style={[styles.eventTitle, { color: tokens.fg1 }]} numberOfLines={1}>
            {event.title}
          </Text>
          <View style={styles.eventMetaRow}>
            {event.startDate ? (
              <Text style={[styles.eventMeta, { color: tokens.fg3 }]}>
                {event.startDate}
              </Text>
            ) : null}
            {timeLabel ? (
              <Text style={[styles.eventMeta, { color: tokens.fg3 }]}>
                {timeLabel}
              </Text>
            ) : null}
            {event.isRecurring ? (
              <Badge tone="soft">
                {recurrenceLabel || t('calendar.recurring')}
              </Badge>
            ) : null}
            {event.reminders.length > 0 ? (
              <View style={styles.eventReminders}>
                <Bell size={12} color={tokens.fg3} />
                <Text style={[styles.eventMeta, { color: tokens.fg3 }]}>
                  {event.reminders.length}
                </Text>
              </View>
            ) : null}
            {event.calendarName ? (
              <Text
                style={[styles.eventTagText, { color: tokens.fg3 }]}
                numberOfLines={1}
              >
                {event.calendarName}
              </Text>
            ) : null}
          </View>
          {event.description ? (
            <Text
              style={[styles.eventDescription, { color: tokens.fg3 }]}
              numberOfLines={1}
            >
              {event.description}
            </Text>
          ) : null}
        </View>
        <RadioGlyph selected={selected} size={24} tokens={tokens} />
        {isReviewMode && suggestionId ? (
          <Pressable
            onPress={() => onDismiss(suggestionId)}
            disabled={dismissPending}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.autoSync.dismissSuggestion')}
            hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
            style={({ pressed }) => [
              styles.dismissButton,
              (pressed || dismissPending) && styles.quietActionDim,
            ]}
          >
            <X size={18} color={tokens.fg4} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}
