import { useMemo, useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Modal, StyleSheet, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { ArrowRight, Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { parseAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useAppTheme } from '@/lib/use-app-theme'
import { useTimeFormat } from '@/hooks/use-time-format'

/**
 * Mobile parity port of `apps/web/components/calendar/calendar-day-detail.tsx`.
 *
 * Bottom-sheet variant of the day-detail overlay. Uses RN's `Modal` for
 * now (no @gorhom/bottom-sheet wrapper here to keep the dep surface
 * narrow). Behaviour, status labels, and "show recurring" toggle mirror
 * the web implementation exactly.
 */
export interface CalendarDayDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateStr: string | null
  entries: CalendarDayEntry[]
}

function statusBadgeStyle(entry: CalendarDayEntry, colors: ReturnType<typeof useAppTheme>['colors']) {
  if (entry.isBadHabit) {
    if (entry.status === 'completed')
      return { color: colors.red400, backgroundColor: colors.red400_10 }
    if (entry.status === 'missed')
      return { color: colors.emerald400, backgroundColor: colors.emerald400_10 }
    return { color: colors.primary, backgroundColor: colors.primary_10 }
  }
  if (entry.status === 'completed')
    return { color: colors.emerald400, backgroundColor: colors.emerald400_10 }
  if (entry.status === 'missed')
    return { color: colors.orange400, backgroundColor: colors.orange400_10 }
  return { color: colors.primary, backgroundColor: colors.primary_10 }
}

export function CalendarDayDetail({
  open,
  onOpenChange,
  dateStr,
  entries,
}: Readonly<CalendarDayDetailProps>) {
  const { t, i18n } = useTranslation()
  const { colors } = useAppTheme()
  const router = useRouter()
  const { displayTime } = useTimeFormat()
  const [showRecurring, setShowRecurring] = useState(true)

  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS

  const formattedDate = useMemo(() => {
    if (!dateStr) return ''
    const date = parseAPIDate(dateStr)
    return format(date, 'EEEE, MMM d', { locale: dateFnsLocale })
  }, [dateStr, dateFnsLocale])

  const filteredEntries = useMemo(() => {
    if (showRecurring) return entries
    return entries.filter((e) => e.isOneTime)
  }, [entries, showRecurring])

  const completedCount = filteredEntries.filter((e) => e.status === 'completed').length

  const statusLabel = useCallback(
    (entry: CalendarDayEntry): string => {
      if (entry.isBadHabit) {
        if (entry.status === 'completed') return t('calendar.status.indulged')
        if (entry.status === 'missed') return t('calendar.status.resisted')
        return t('calendar.status.scheduled')
      }
      if (entry.status === 'completed') return t('calendar.status.completed')
      if (entry.status === 'missed') return t('calendar.status.missed')
      return t('calendar.status.upcoming')
    },
    [t],
  )

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={() => onOpenChange(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderMuted }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{formattedDate}</Text>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {entries.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                {t('calendar.noHabitsScheduled')}
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summary, { color: colors.textFaded }]}>
                    {t('calendar.dayDetail.completionSummary', {
                      done: completedCount,
                      total: filteredEntries.length,
                    })}
                  </Text>
                  <View style={styles.toggleRow}>
                    <Switch value={showRecurring} onValueChange={setShowRecurring} />
                    <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>
                      {t('calendar.showRecurring')}
                    </Text>
                  </View>
                </View>

                {filteredEntries.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textMuted }]}>
                    {t('calendar.noHabitsScheduled')}
                  </Text>
                ) : null}

                {filteredEntries.map((entry, i) => {
                  const badge = statusBadgeStyle(entry, colors)
                  return (
                    <View key={entry.habitId}>
                      <View style={styles.entryRow}>
                        <View
                          style={[
                            styles.iconCircle,
                            entry.status === 'completed'
                              ? { backgroundColor: colors.emerald500_20, borderColor: colors.emerald500_30 }
                              : { borderColor: colors.borderFaded30 },
                          ]}
                        >
                          {entry.status === 'completed' ? (
                            <Check size={12} color={colors.emerald400} />
                          ) : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.titleRow}>
                            <Text
                              style={[
                                styles.entryTitle,
                                { color: colors.textPrimary },
                                entry.status === 'completed' ? { opacity: 0.6 } : null,
                              ]}
                              numberOfLines={1}
                            >
                              {entry.title}
                            </Text>
                            {entry.dueTime ? (
                              <Text style={[styles.dueTime, { color: colors.textSecondary }]}>
                                {displayTime(entry.dueTime)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                          <Text style={[styles.badgeText, { color: badge.color }]}>
                            {statusLabel(entry).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {i < filteredEntries.length - 1 ? (
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      ) : null}
                    </View>
                  )
                })}
              </View>
            )}
          </ScrollView>

          <Pressable
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => {
              onOpenChange(false)
              if (dateStr) router.push(`/?date=${dateStr}` as never)
            }}
          >
            <ArrowRight size={16} color={colors.white} />
            <Text style={[styles.ctaText, { color: colors.white }]}>{t('calendar.goToDay')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouch: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  body: { flexGrow: 0 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 32 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summary: { fontSize: 13, flexShrink: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  entryTitle: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  dueTime: { fontSize: 11, fontWeight: '600' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  divider: { height: 1, opacity: 0.3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 18,
    marginTop: 12,
  },
  ctaText: { fontSize: 14, fontWeight: '700' },
})
