import { useCallback, useMemo, useRef, useState } from 'react'
import {
  LayoutAnimation,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native'
import {
  ChevronRight,
  ClipboardCheck,
  Bell,
  MoreVertical,
  Plus,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  computeHabitCardStatus,
  computeHabitChecklistCount,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitStatusBadge,
  computeNextReminderLabel,
  resolveHabitAccent,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitCardShell } from './habits/primitives/habit-card-shell'
import { IconColorChip } from './habits/primitives/icon-color-chip'
import { ProgressRing } from './habits/primitives/progress-ring'
import { HabitLogButton } from './habits/primitives/habit-log-button'
import { StreakFlameMini } from './habits/primitives/streak-flame-mini'
import { SevenDayStrip } from './habits/primitives/seven-day-strip'
import { SwipeableRow } from './habits/primitives/swipeable-row'
import { HabitActionsSheet } from './habits/primitives/habit-actions-sheet'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HabitCardActions {
  onLog?: () => void
  onUnlog?: () => void
  onSkip?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onEdit?: () => void
  onMoveParent?: () => void
  onDetail?: () => void
  onDrillInto?: () => void
  onToggleSelection?: () => void
  onAddSubHabit?: () => void
  onToggleExpand?: () => void
  onForceLogParent?: () => void
  onEnterSelectMode?: () => void
  onLongPressCard?: () => void
}

interface HabitCardProps {
  habit: NormalizedHabit
  selectedDate?: Date
  depth?: number
  isSelectMode?: boolean
  isSelected?: boolean
  isJustCreated?: boolean
  showAddSubHabit?: boolean
  hasChildren?: boolean
  hasSubHabits?: boolean
  isExpanded?: boolean
  isLastChild?: boolean
  childrenDone?: number
  childrenTotal?: number
  searchQuery?: string
  actions?: HabitCardActions
  tourTargetId?: string
  disableSwipe?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

export function HabitCard({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  isJustCreated = false,
  hasChildren = false,
  hasSubHabits = false,
  isExpanded = false,
  childrenDone = 0,
  childrenTotal = 0,
  actions,
  disableSwipe = false,
}: Readonly<HabitCardProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [inlineExpanded, setInlineExpanded] = useState(false)

  const isChild = depth > 0

  const translateAdapter = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values as Record<string, unknown>) as string,
    [t],
  )

  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const frequencyLabel = useMemo(
    () => computeHabitFrequencyLabel(habit, translateAdapter),
    [habit, translateAdapter],
  )

  const statusBadge = useMemo(
    () => computeHabitStatusBadge(status, translateAdapter),
    [status, translateAdapter],
  )

  const flexibleLabel = useMemo(
    () => computeHabitFlexibleProgressLabel(habit, translateAdapter),
    [habit, translateAdapter],
  )

  const checklistCount = useMemo(() => computeHabitChecklistCount(habit), [habit])
  const nextReminder = useMemo(
    () => computeNextReminderLabel(habit, new Date(), translateAdapter),
    [habit, translateAdapter],
  )

  const accent = useMemo(
    () =>
      resolveHabitAccent(habit, status, {
        primary: colors.primary,
        amber: colors.amber400 ?? '#fbbf24',
        red: colors.red400 ?? '#f87171',
        dim: (hex: string, alpha: number) => withAlpha(hex, alpha),
      }),
    [habit, status, colors.primary, colors.amber400, colors.red400],
  )

  const isDone = habit.isCompleted || habit.isLoggedInRange
  const isParentWithChildren = hasChildren && childrenTotal > 0
  const parentProgress =
    isParentWithChildren && childrenTotal > 0 ? childrenDone / childrenTotal : 0
  const parentAllDone = isParentWithChildren && childrenDone >= childrenTotal
  const hasFlexibleProgress =
    habit.isFlexible && (habit.flexibleTarget ?? 0) > 0
  const flexibleProgress = hasFlexibleProgress
    ? (habit.flexibleCompleted ?? 0) / (habit.flexibleTarget ?? 1)
    : 0

  const toggleInlineExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setInlineExpanded((prev) => !prev)
  }, [])

  const handleCardPress = useCallback(() => {
    if (isSelectMode) {
      actions?.onToggleSelection?.()
      return
    }
    if (hasChildren && actions?.onToggleExpand) {
      actions.onToggleExpand()
      return
    }
    toggleInlineExpand()
  }, [actions, hasChildren, isSelectMode, toggleInlineExpand])

  const handleLogPress = useCallback(() => {
    if (isDone) actions?.onUnlog?.()
    else actions?.onLog?.()
  }, [actions, isDone])

  // Sub-habit support flags
  const badges: Array<{ key: string; label: string; bg: string; color: string }> = []
  if (statusBadge) {
    badges.push({ key: 'status', label: statusBadge.text, bg: statusBadge.bg, color: statusBadge.color })
  }
  if (flexibleLabel) {
    badges.push({
      key: 'flexible',
      label: flexibleLabel,
      bg: withAlpha(accent.iconFg, 0.14),
      color: accent.iconFg,
    })
  }

  const cardContent = (
    <View style={styles.row}>
      {/* Left: chevron + log/ring or selection checkbox */}
      <View style={styles.leftCol}>
        {hasChildren && !isSelectMode && actions?.onToggleExpand && (
          <TouchableOpacity
            onPress={actions.onToggleExpand}
            hitSlop={8}
            accessibilityLabel={isExpanded ? 'Collapse' : 'Expand'}
            style={styles.chevron}
          >
            <ChevronRight
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
            />
          </TouchableOpacity>
        )}

        {isSelectMode ? (
          <View
            style={[
              styles.selectDot,
              {
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primary : 'transparent',
              },
            ]}
          />
        ) : isParentWithChildren ? (
          <ProgressRing
            progress={parentProgress}
            color={accent.ringStroke}
            done={parentAllDone}
            size={36}
          >
            {!parentAllDone && (
              <Text style={[styles.ringCenterText, { color: colors.textPrimary }]}>
                {childrenDone}/{childrenTotal}
              </Text>
            )}
          </ProgressRing>
        ) : hasFlexibleProgress ? (
          <ProgressRing
            progress={flexibleProgress}
            color={accent.ringStroke}
            done={flexibleProgress >= 1}
            size={36}
          >
            <Text style={[styles.ringCenterText, { color: colors.textPrimary }]}>
              {habit.flexibleCompleted ?? 0}/{habit.flexibleTarget ?? 0}
            </Text>
          </ProgressRing>
        ) : (
          <HabitLogButton
            color={accent.ringStroke}
            done={isDone}
            size={36}
            overdue={status === 'overdue'}
            onPress={handleLogPress}
            accessibilityLabel={t('habits.card.logAction') as string}
          />
        )}
      </View>

      {/* Middle: icon chip + title + frequency */}
      {!isChild && (
        <IconColorChip
          icon={habit.icon ?? null}
          color={accent.iconFg}
          title={habit.title}
          size={40}
        />
      )}

      <View style={styles.textCol}>
        <Text
          style={[
            styles.title,
            { color: colors.textPrimary, fontSize: isChild ? 14 : 16 },
          ]}
          numberOfLines={1}
        >
          {habit.title}
        </Text>
        <View style={styles.subRow}>
          <Text
            style={[styles.freq, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {frequencyLabel}
          </Text>
          {badges.map((badge) => (
            <View
              key={badge.key}
              style={[styles.badge, { backgroundColor: badge.bg }]}
            >
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Right: streak + menu */}
      <View style={styles.rightCol}>
        {!isChild && habit.currentStreak && habit.currentStreak >= 2 ? (
          <StreakFlameMini streak={habit.currentStreak} />
        ) : null}

        {!isSelectMode && (
          <TouchableOpacity
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            accessibilityLabel={t('habits.card.menuAction') as string}
            style={styles.menuBtn}
          >
            <MoreVertical size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )

  const inlinePreview =
    inlineExpanded && !isChild ? (
      <View style={styles.inlinePreview}>
        <SevenDayStrip habit={habit} accentColor={accent.ringStroke} />
        <View style={styles.inlineMetaRow}>
          {checklistCount && (
            <View style={styles.inlineMetaItem}>
              <ClipboardCheck size={12} color={colors.textMuted} />
              <Text style={[styles.inlineMetaText, { color: colors.textMuted }]}>
                {checklistCount.checked}/{checklistCount.total}
              </Text>
            </View>
          )}
          {nextReminder && (
            <View style={styles.inlineMetaItem}>
              <Bell size={12} color={colors.textMuted} />
              <Text style={[styles.inlineMetaText, { color: colors.textMuted }]}>{nextReminder}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => actions?.onDetail?.()}
          style={[styles.seeMore, { borderColor: colors.border }]}
        >
          <Text style={[styles.seeMoreText, { color: accent.ringStroke }]}>
            {t('habits.card.seeMore') as string}
          </Text>
          <ChevronRight size={14} color={accent.ringStroke} />
        </TouchableOpacity>
      </View>
    ) : null

  const canSwipe = !disableSwipe && !isSelectMode && !isChild && Boolean(actions?.onLog)

  const shell = (
    <HabitCardShell
      accentBar={accent.accentBar}
      status={status}
      isSelected={isSelected}
      isChild={isChild}
      depth={depth}
      dimmed={isDone && status === 'completed'}
      onPress={handleCardPress}
      onLongPress={actions?.onLongPressCard ?? actions?.onEnterSelectMode}
      accessibilityLabel={habit.title}
    >
      {cardContent}
      {inlinePreview}
    </HabitCardShell>
  )

  return (
    <>
      {canSwipe ? (
        <SwipeableRow
          enabled
          done={isDone}
          onLog={handleLogPress}
          onMenu={() => setMenuOpen(true)}
        >
          {shell}
        </SwipeableRow>
      ) : (
        shell
      )}

      <HabitActionsSheet
        visible={menuOpen}
        canSkip={Boolean(actions?.onSkip)}
        onClose={() => setMenuOpen(false)}
        onEdit={() => actions?.onEdit?.()}
        onDuplicate={() => actions?.onDuplicate?.()}
        onSkip={actions?.onSkip}
        onDelete={() => actions?.onDelete?.()}
      />
    </>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chevron: {
    padding: 2,
  },
  selectDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  ringCenterText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  freq: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuBtn: {
    padding: 4,
  },
  inlinePreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  inlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  inlineMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineMetaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  seeMore: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  seeMoreText: {
    fontSize: 11,
    fontWeight: '600',
  },
})

export default HabitCard
