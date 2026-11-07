import { nestedControlFill, surfaceHighlighted, useRowFeedback } from '@/hooks/use-row-feedback'
import { PersonalText } from '@/components/ui/personal-text'
import { useDateFormat } from '@/hooks/use-date-format'
import { useTimeFormat } from '@/hooks/use-time-format'
import { Pressable, Text, View, StyleSheet } from 'react-native'
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

function importIssueVisuals(hasImportIssue: boolean, highlighted: boolean, tokens: AppTokensV2) {
  return hasImportIssue
    ? { titleColor: highlighted ? tokens.fg2 : tokens.fg3, selectorOpacity: 0.5 }
    : { titleColor: tokens.fg1, selectorOpacity: 1 }
}

function eventRowBackground(
  hasImportIssue: boolean,
  highlighted: boolean,
  selectedBackground: string,
  tokens: AppTokensV2,
) {
  if (highlighted) return 'transparent'
  return hasImportIssue ? tokens.bgElev : selectedBackground
}

function eventAccessibleLabel(event: CalendarSyncEvent, displayDate: ReturnType<typeof useDateFormat>['displayDate'], timeLabel: string, recurrenceLabel: string, importIssueLabel: string | null) {
  return [event.title, event.startDate ? displayDate(event.startDate, { weekday: 'short', day: 'numeric', month: 'short' }) : '', timeLabel, recurrenceLabel, event.reminders.length ? String(event.reminders.length) : '', event.calendarName, importIssueLabel].filter(Boolean).join(', ')
}

function eventContentProps(expanded: boolean) {
  return expanded
    ? { pointerEvents: 'box-none' as const, importantForAccessibility: 'auto' as const }
    : { pointerEvents: 'none' as const, importantForAccessibility: 'no-hide-descendants' as const }
}

function EventRowFeedback({ highlighted, focused, tokens }: Readonly<{ highlighted: boolean; focused: boolean; tokens: AppTokensV2 }>) {
  return <View pointerEvents="none" accessible={false} testID="calendar-event-feedback" style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: highlighted ? tokens.bgHover : 'transparent', outlineWidth: focused ? 2 : 0, outlineColor: tokens.fg1, outlineStyle: 'solid', outlineOffset: -2 }]} />
}

interface CalendarSyncEventRowProps {
  event: CalendarSyncEvent
  weekStartDay: 0 | 1
  selected: boolean
  initiallyExpanded?: boolean
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
  initiallyExpanded = false,
  isReviewMode,
  suggestionId,
  dismissPending,
  styles,
  tokens,
  t,
  onToggle,
  onDismiss,
}: Readonly<CalendarSyncEventRowProps>) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const bodyFeedback = useRowFeedback()
  const dismissFeedback = useRowFeedback(dismissPending)
  const disclosureFeedback = useRowFeedback()
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
  const highlighted = surfaceHighlighted(!hasImportIssue && bodyFeedback.highlighted, [dismissFeedback, disclosureFeedback])
  const issueVisuals = importIssueVisuals(hasImportIssue, highlighted, tokens)
  const focused = bodyFeedback.focused
  const accessibleLabel = eventAccessibleLabel(event, displayDate, timeLabel, recurrenceLabel, importIssueLabel)

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, borderRadius: 12, marginHorizontal: -8, paddingHorizontal: 8 }}>
      <EventRowFeedback highlighted={highlighted} focused={focused} tokens={tokens} />
      <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable
        hitSlop={{ left: 16, right: 16 }}
        {...bodyFeedback.handlers}
        onPress={() => onToggle(event.id)}
        disabled={importIssue !== null}
        accessibilityRole="checkbox"
        accessibilityLabel={accessibleLabel}
        accessibilityState={{ checked: selected, disabled: importIssue !== null }}
        accessibilityHint={importIssueLabel ?? undefined}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 12 }}
      >
        <View pointerEvents="none" accessible={false} testID="calendar-event-fill" style={{ position: 'absolute', top: 0, bottom: 0, left: -12, right: -12, borderRadius: 12, overflow: 'hidden', backgroundColor: eventRowBackground(hasImportIssue, highlighted, selectedBackground, tokens) }} />
      </Pressable>
      <View {...eventContentProps(expanded)} style={styles.eventRow}>
        <View pointerEvents="box-none" style={styles.eventBody}>
          <PersonalText
            style={[styles.eventTitle, { color: issueVisuals.titleColor }]}
            expanded={expanded}>{event.title}</PersonalText>
          <View pointerEvents="box-none" style={styles.eventMetaRow}>
            {event.startDate ? (
              <View pointerEvents="none" importantForAccessibility="no-hide-descendants"><Text style={[styles.eventMeta, { color: tokens.fg2 }]}>
                {displayDate(event.startDate, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text></View>
            ) : null}
            {timeLabel ? (
              <View pointerEvents="none" importantForAccessibility="no-hide-descendants"><Text style={[styles.eventMeta, { color: tokens.fg2 }]}>
                {timeLabel}
              </Text></View>
            ) : null}
            {event.isRecurring ? (
              <View pointerEvents="none" importantForAccessibility="no-hide-descendants"><Badge >
                {recurrenceLabel || t('calendar.recurring')}
              </Badge></View>
            ) : null}
            {event.reminders.length > 0 ? (
              <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={styles.eventReminders}>
                <Bell size={16} color={tokens.fg2} />
                <Text style={[styles.eventMeta, { color: tokens.fg2 }]}>
                  {event.reminders.length}
                </Text>
              </View>
            ) : null}
            {event.calendarName ? (
              <PersonalText
                 expanded={expanded} style={[styles.eventTagText, { color: tokens.fg2 }]}
              >{event.calendarName}</PersonalText>
            ) : null}
          </View>
          {importIssueLabel ? (
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants"><Text data-slot="calendar-import-issue" style={[styles.importIssue, { color: tokens.statusBadText }]}>
              {importIssueLabel}
            </Text></View>
          ) : null}
        </View>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ opacity: issueVisuals.selectorOpacity }}>
          <RadioGlyph selected={selected} size={24} tokens={tokens} />
        </View>
      </View>
      </View>
      {isReviewMode && suggestionId ? (
        <Pressable
          {...dismissFeedback.handlers}
          onPress={() => onDismiss(suggestionId)}
          disabled={dismissPending}
          accessibilityRole="button"
          accessibilityLabel={t('calendar.autoSync.dismissSuggestion')}
          style={[styles.dismissButton, { backgroundColor: nestedControlFill(dismissFeedback, tokens) }, dismissPending && styles.quietActionDim]}
        ><X size={20} color={tokens.fg3} strokeWidth={1.8} /></Pressable>
      ) : null}
      <InsetFocusPressable {...disclosureFeedback.handlers} accessibilityRole="button" accessibilityLabel={t('contextMenu.viewDetails')} accessibilityHint={disclosureLabel} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ minHeight: 48, minWidth: 48, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: nestedControlFill(disclosureFeedback, tokens) }}><ChevronDown size={20} strokeWidth={1.5} color={tokens.fg3} accessible={false} /></InsetFocusPressable>
      </View>
    </View>
  )
}
