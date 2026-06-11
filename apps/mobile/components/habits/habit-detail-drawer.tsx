import { useState, useCallback, useMemo } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Orbit } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { HabitChecklist } from './habit-checklist'
import { DescriptionViewer } from './description-viewer'
import { HabitCalendar } from './habit-calendar'
import { HabitDetailStatsRow } from './habit-detail-sections'
import { useTimeFormat } from '@/hooks/use-time-format'
import {
  useHabitFullDetail,
  useUpdateChecklist,
  useLogHabit,
} from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { formatHabitDetailSummary, formatLocaleDate } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitDetailDrawerProps {
  open: boolean
  onClose: () => void
  habit: NormalizedHabit | null
  onLogged?: (habitId: string) => void
}

/**
 * Habit Detail Drawer. Covers all variants by data-driven section presence:
 * active, skipped (checklist hidden when empty), checklist, bad, slip alert
 * (when `slipAlertEnabled`), linked goal (when `linkedGoals` non empty).
 */
export function HabitDetailDrawer({
  open,
  onClose,
  habit,
  onLogged,
}: Readonly<HabitDetailDrawerProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { displayTime } = useTimeFormat()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const habitId = habit?.id ?? ''

  const { data: fullDetail, isLoading: metricsLoading } = useHabitFullDetail(
    open && habitId ? habitId : null,
  )

  const updateChecklist = useUpdateChecklist()
  const logHabit = useLogHabit()

  const metrics = fullDetail?.metrics ?? null
  const logs = fullDetail?.logs ?? null
  const liveChecklist = useMemo(
    () => fullDetail?.habit.checklistItems ?? habit?.checklistItems ?? [],
    [fullDetail?.habit.checklistItems, habit?.checklistItems],
  )

  const [descriptionViewerOpen, setDescriptionViewerOpen] = useState(false)
  const [showChecklistCompleteConfirm, setShowChecklistCompleteConfirm] =
    useState(false)

  const router = useRouter()
  const askPrompt = useMemo(() => {
    if (!habit) return ''
    return (habit.checklistItems?.length ?? 0) > 0
      ? t('habits.detail.askAstraSubHabits')
      : t('habits.detail.askAstraDefault')
  }, [habit, t])

  const handleAskAstra = useCallback(() => {
    if (!habit) return
    const seed =
      (habit.checklistItems?.length ?? 0) > 0
        ? t('habits.detail.askAstraSeedSubHabits', { title: habit.title })
        : t('habits.detail.askAstraSeedDefault', { title: habit.title })
    void AsyncStorage.setItem('orbit-chat-draft', seed)
    onClose()
    router.push('/chat')
  }, [habit, onClose, router, t])

  const handleChecklistToggle = useCallback(
    (index: number) => {
      if (!habit) return
      const items = [...liveChecklist]
      const item = items[index]
      if (!item) return
      items[index] = { ...item, isChecked: !item.isChecked }
      updateChecklist.mutate({ habitId: habit.id, items })
      if (
        items.length > 0 &&
        items.every((i) => i.isChecked) &&
        !habit.isCompleted
      ) {
        setShowChecklistCompleteConfirm(true)
      }
    },
    [habit, liveChecklist, updateChecklist],
  )

  const handleChecklistReset = useCallback(() => {
    if (!habit) return
    const items = liveChecklist.map((i) => ({ ...i, isChecked: false }))
    updateChecklist.mutate({ habitId: habit.id, items })
  }, [habit, liveChecklist, updateChecklist])

  const handleChecklistClear = useCallback(() => {
    if (!habit) return
    updateChecklist.mutate({ habitId: habit.id, items: [] })
  }, [habit, updateChecklist])

  const summaryStrip = useMemo(() => {
    if (!habit) return ''
    return formatHabitDetailSummary({
      currentStreak: habit.currentStreak ?? 0,
      streakLabel: t('habits.detail.currentStreak'),
      hasLinkedGoal: (habit.linkedGoals?.length ?? 0) > 0,
      linkedGoalLabel: t('habits.detail.linkedGoal'),
      checklistChecked: liveChecklist.filter((i) => i.isChecked).length,
      checklistTotal: liveChecklist.length,
    })
  }, [habit, liveChecklist, t])

  return (
    <>
      {habit?.description ? (
        <DescriptionViewer
          open={descriptionViewerOpen}
          onClose={() => setDescriptionViewerOpen(false)}
          title={habit.title}
          description={habit.description}
        />
      ) : null}

      <ConfirmDialog
        open={showChecklistCompleteConfirm}
        onOpenChange={setShowChecklistCompleteConfirm}
        title={t('habits.checklistCompleteTitle')}
        description={t('habits.checklistCompleteMessage', {
          name: habit?.title ?? '',
        })}
        confirmLabel={t('habits.checklistCompleteConfirm')}
        cancelLabel={t('common.cancel')}
        variant="success"
        onConfirm={async () => {
          if (!habit) return
          try {
            await logHabit.mutateAsync({ habitId: habit.id })
            onLogged?.(habit.id)
          } catch {
          }
        }}
      />

      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={habit?.title}
        contentKey={habitId}
        snapPoints={['68%', '92%']}
      >
        {habit ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={withDrawerContentInset(styles.scrollContent)}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {habit.emoji || summaryStrip ? (
              <View style={styles.titleBlock}>
                {habit.emoji ? (
                  <View
                    style={[
                      styles.emojiWell,
                      habit.isBadHabit
                        ? { backgroundColor: `${tokens.statusBad}1F` }
                        : null,
                    ]}
                  >
                    <Text style={styles.emojiWellText}>{habit.emoji}</Text>
                  </View>
                ) : null}
                {summaryStrip ? (
                  <Text
                    style={[
                      styles.titleMeta,
                      { color: habit.isBadHabit ? tokens.statusBad : tokens.fg3 },
                    ]}
                    numberOfLines={2}
                  >
                    {summaryStrip}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {habit.description ? (
              <TouchableOpacity
                onPress={() => setDescriptionViewerOpen(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('habits.detail.viewDescription')}
              >
                <Text style={styles.description} numberOfLines={2}>
                  {habit.description}
                </Text>
              </TouchableOpacity>
            ) : null}

            {liveChecklist.length > 0 ? (
              <View>
                <SectionLabel top={4} bottom={8}>
                  {t('habits.form.checklist')}
                </SectionLabel>
                <View style={styles.sectionInset}>
                  <HabitChecklist
                    items={liveChecklist}
                    interactive
                    onToggle={handleChecklistToggle}
                    onReset={handleChecklistReset}
                    onClear={handleChecklistClear}
                  />
                </View>
              </View>
            ) : null}

            {habit.frequencyUnit || habit.isGeneral ? (
              <View>
                <SectionLabel top={4} bottom={8}>
                  {t('habits.detail.stats')}
                </SectionLabel>
                <HabitDetailStatsRow
                  metrics={metrics}
                  loading={metricsLoading}
                  isBadHabit={habit.isBadHabit}
                  t={t}
                  tokens={tokens}
                />
              </View>
            ) : null}

            {habit.dueTime ? (
              <View>
                <SectionLabel top={8} bottom={0}>
                  {t('habits.detail.reminders')}
                </SectionLabel>
                <SettingsRow
                  label={t('habits.form.dueTime')}
                  value={displayTime(habit.dueTime)}
                  mono
                  accessory="none"
                />
                {habit.scheduledReminders?.map((sr, idx) => (
                  <SettingsRow
                    key={`${sr.when}-${sr.time}-${idx}`}
                    label={
                      sr.when === 'day_before'
                        ? t('habits.form.scheduledReminderDayBefore')
                        : t('habits.form.scheduledReminderSameDay')
                    }
                    value={displayTime(sr.time)}
                    mono
                    accessory="none"
                  />
                ))}
              </View>
            ) : null}

            {habit.endDate ? (
              <SettingsRow
                label={t('habits.detail.endsOn')}
                value={formatLocaleDate(habit.endDate, locale, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                mono
                accessory="none"
              />
            ) : null}

            {habit.linkedGoals && habit.linkedGoals.length > 0 ? (
              <View>
                <SectionLabel top={8} bottom={0}>
                  {t('habits.detail.linkedGoal')}
                </SectionLabel>
                {habit.linkedGoals.map((g) => (
                  <SettingsRow
                    key={g.id}
                    label={g.title}
                    accessory="chevron"
                  />
                ))}
              </View>
            ) : null}


            <View>
              <SectionLabel top={8} bottom={8}>
                {t('habits.detail.activity')}
              </SectionLabel>
              <View style={styles.sectionInset}>
                <HabitCalendar habitId={habit.id} logs={logs} />
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleAskAstra}
              accessibilityRole="button"
              accessibilityLabel={`${t('habits.detail.askAstraEyebrow')}: ${askPrompt}`}
              style={styles.askAstra}
            >
              <View
                style={[
                  styles.askAstraRule,
                  { backgroundColor: tokens.primary },
                ]}
              />
              <View style={styles.askAstraContent}>
                <View style={styles.askAstraEyebrow}>
                  <Orbit
                    size={12}
                    color={tokens.primary}
                    strokeWidth={1.7}
                  />
                  <Text
                    style={[
                      styles.askAstraEyebrowText,
                      { color: tokens.fg3 },
                    ]}
                  >
                    {t('habits.detail.askAstraEyebrow')}
                  </Text>
                </View>
                <Text style={[styles.askAstraBody, { color: tokens.fg2 }]}>
                  {askPrompt}
                </Text>
              </View>
              <ChevronRight
                size={16}
                color={tokens.fg3}
                strokeWidth={1.7}
              />
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </BottomSheetModal>
    </>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
      gap: 0,
    },
    titleBlock: {
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
    },
    emojiWell: {
      width: 76,
      height: 76,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${tokens.fg1}0F`,
    },
    emojiWellText: {
      fontSize: 38,
      lineHeight: 46,
    },
    titleMeta: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    description: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    sectionInset: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    askAstra: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 34,
      paddingRight: 20,
      paddingTop: 16,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 8,
    },
    askAstraRule: {
      position: 'absolute',
      left: 20,
      top: 20,
      bottom: 28,
      width: 2,
      borderRadius: 1,
    },
    askAstraContent: {
      flex: 1,
    },
    askAstraEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    askAstraEyebrowText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10.5,
      letterSpacing: 0.63,
    },
    askAstraBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
    },
  })
}
