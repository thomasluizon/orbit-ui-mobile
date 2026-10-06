import { PersonalText } from '@/components/ui/personal-text'
import { useDateFormat } from '@/hooks/use-date-format'
import { useTimeFormat } from '@/hooks/use-time-format'
import { Pressable, Text, View } from 'react-native'
import { useState } from 'react'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { Bell, ChevronDown, X } from '@/components/ui/icons'
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
import type { CalendarSyncStyles } from '@/components/calendar-sync/calendar-import-styles'

function importIssueVisuals(hasImportIssue: boolean, tokens: AppTokensV2) {
  return hasImportIssue
    ? { titleColor: tokens.fg3, selectorOpacity: 0.5 }
    : { titleColor: tokens.fg1, selectorOpacity: 1 }
}

function eventRowBackground(
  hasImportIssue: boolean,
  pressed: boolean,
  selectedBackground: string,
  tokens: AppTokensV2,
) {
  if (pressed) return tokens.bgHover
  return hasImportIssue ? tokens.bgElev : selectedBackground
}

function eventAccessibleLabel(event: CalendarSyncEvent, displayDate: ReturnType<typeof useDateFormat>['displayDate'], timeLabel: string, recurrenceLabel: string, importIssueLabel: string | null) {
  return [event.title, event.startDate ? displayDate(event.startDate, { weekday: 'short', day: 'numeric', month: 'short' }) : '', timeLabel, recurrenceLabel, event.reminders.length ? String(event.reminders.length) : '', event.calendarName, event.description, importIssueLabel].filter(Boolean).join(', ')
}

interface CalendarSyncEventRowProps {
  event: CalendarSyncEvent
  weekStartDay: 0 | 1
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
  weekStartDay,
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
  const [expanded, setExpanded] = useState(false)
  const disclosureLabel = [event.title, event.calendarName].filter(Boolean).join(', ')
  const { displayTime } = useTimeFormat()
  const { displayDate } = useDateFormat()
  const importIssue = getCalendarSyncImportIssue(
    event.recurrenceRule,
    event.startDate,
    event.startTime,
    event.startUtc,
    event.recurrenceTimeZone,
    weekStartDay,
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
  const endTimeSuffix = event.endTime ? ` - ${displayTime(event.endTime)}` : ''
  const timeLabel = event.startTime ? `${displayTime(event.startTime)}${endTimeSuffix}` : ''
  const selectedBackground = selected ? tintFromPrimary(tokens, 0.06) : 'transparent'
  const hasImportIssue = importIssue !== null
  const issueVisuals = importIssueVisuals(hasImportIssue, tokens)
  const accessibleLabel = eventAccessibleLabel(event, displayDate, timeLabel, recurrenceLabel, importIssueLabel)

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Pressable
        onPress={() => onToggle(event.id)}
        disabled={importIssue !== null}
        accessibilityRole="checkbox"
        accessibilityLabel={accessibleLabel}
        accessibilityState={{ checked: selected, disabled: importIssue !== null }}
        accessibilityHint={importIssueLabel ?? undefined}
        style={({ pressed }) => [
          styles.eventRow,
          { flex: 1 },
          {
            backgroundColor: eventRowBackground(
              hasImportIssue,
              pressed,
              selectedBackground,
              tokens,
            ),
          },
        ]}
      >
        <View style={styles.eventBody}>
          <PersonalText
            style={[styles.eventTitle, { color: issueVisuals.titleColor }]}
          >{event.title}</PersonalText>
          <View style={styles.eventMetaRow}>
            {event.startDate ? (
              <Text style={[styles.eventMeta, { color: tokens.fg2 }]}>
                {displayDate(event.startDate, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            ) : null}
            {timeLabel ? (
              <Text style={[styles.eventMeta, { color: tokens.fg2 }]}>
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
                <Bell size={16} color={tokens.fg2} />
                <Text style={[styles.eventMeta, { color: tokens.fg2 }]}>
                  {event.reminders.length}
                </Text>
              </View>
            ) : null}
            {event.calendarName ? (
              <PersonalText
                style={[styles.eventTagText, { color: tokens.fg2 }]}
              >{event.calendarName}</PersonalText>
            ) : null}
          </View>
          {event.description ? (
            <Text
              style={[styles.eventDescription, { color: tokens.fg2 }]}
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
      </Pressable>
      {isReviewMode && suggestionId ? (
        <Pressable
          onPress={() => onDismiss(suggestionId)}
          disabled={dismissPending}
          accessibilityRole="button"
          accessibilityLabel={t('calendar.autoSync.dismissSuggestion')}
          style={({ pressed }) => [styles.dismissButton, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }, dismissPending && styles.quietActionDim]}
        ><X size={20} color={tokens.fg3} strokeWidth={1.8} /></Pressable>
      ) : null}
      <InsetFocusPressable accessibilityRole="button" accessibilityLabel={t('contextMenu.viewDetails')} accessibilityHint={disclosureLabel} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => ({ minHeight: 48, minWidth: 48, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent' })}><ChevronDown size={20} strokeWidth={1.5} color={tokens.fg3} accessible={false} /></InsetFocusPressable>
      </View>
      {expanded ? <FullEventText event={event} styles={styles} tokens={tokens} /> : null}
    </View>
  )
}

function FullEventText({ event, styles, tokens }: Readonly<Pick<CalendarSyncEventRowProps, 'event' | 'styles' | 'tokens'>>) {
  return <View><PersonalText expanded style={[styles.eventTitle, { color: tokens.fg1 }]}>{event.title}</PersonalText>{event.calendarName ? <PersonalText expanded style={[styles.eventTagText, { color: tokens.fg2 }]}>{event.calendarName}</PersonalText> : null}</View>
}
