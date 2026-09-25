import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Bell, X } from '@/components/ui/icons'
import type { TFunction } from 'i18next'
import {
  formatCalendarSyncRecurrenceLabel,
  getCalendarSyncImportIssue,
  getCalendarSyncImportIssueMessageKey,
  type CalendarSyncEvent,
} from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { RadioGlyph } from '@/components/ui/select-check'
import { Badge } from '@/components/ui/badge'
import type { CalendarSyncStyles } from '@/app/calendar-sync-styles'

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

function importIssueVisuals(hasImportIssue: boolean, tokens: AppTokensV2) {
  return hasImportIssue
    ? { titleColor: tokens.fg3, selectorOpacity: 0.5 }
    : { titleColor: tokens.fg1, selectorOpacity: 1 }
}

function eventRowBackground(
  hasImportIssue: boolean,
  pressed: boolean,
  selectedBackground: string,
  elevatedBackground: string,
) {
  return hasImportIssue || pressed ? elevatedBackground : selectedBackground
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
  const importIssue = getCalendarSyncImportIssue(
    event.recurrenceRule,
    event.startDate,
    event.startTime,
    event.startUtc,
  )
  const importIssueLabel = importIssue
    ? t(getCalendarSyncImportIssueMessageKey(importIssue))
    : null
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
  const hasImportIssue = importIssue !== null
  const issueVisuals = importIssueVisuals(hasImportIssue, tokens)

  return (
    <Animated.View entering={rowEntrance(index)}>
      <Pressable
        onPress={() => onToggle(event.id)}
        disabled={importIssue !== null}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled: importIssue !== null }}
        accessibilityHint={importIssueLabel ?? undefined}
        style={({ pressed }) => [
          styles.eventRow,
          {
            borderBottomColor: tokens.hairline,
            backgroundColor: eventRowBackground(
              hasImportIssue,
              pressed,
              selectedBackground,
              tokens.bgElev,
            ),
          },
        ]}
      >
        <View style={styles.eventBody}>
          <Text
            style={[styles.eventTitle, { color: issueVisuals.titleColor }]}
            numberOfLines={1}
          >
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
              <Badge >
                {recurrenceLabel || t('calendar.recurring')}
              </Badge>
            ) : null}
            {event.reminders.length > 0 ? (
              <View style={styles.eventReminders}>
                <Bell size={16} color={tokens.fg3} />
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
          {importIssueLabel ? (
            <Text style={[styles.importIssue, { color: tokens.statusBadText }]}>
              {importIssueLabel}
            </Text>
          ) : null}
        </View>
        <View style={{ opacity: issueVisuals.selectorOpacity }}>
          <RadioGlyph selected={selected} size={24} tokens={tokens} />
        </View>
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
            <X size={20} color={tokens.fg3} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}
