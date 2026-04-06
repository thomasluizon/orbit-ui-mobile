import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from 'react-native'
import {
  ChevronRight,
  Check,
  MoreVertical,
  Plus,
  ArrowRight,
  FastForward,
  Copy,
  CheckCircle2,
  Trash2,
  ClipboardCheck,
  Flame,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
  onLog?: () => void
  onUnlog?: () => void
  onSkip?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onMoveParent?: () => void
  onDetail?: () => void
  onDrillInto?: () => void
  onToggleSelection?: () => void
  onAddSubHabit?: () => void
  onToggleExpand?: () => void
  onForceLogParent?: () => void
  onEnterSelectMode?: () => void
}

function withAlpha(color: string, opacity: number, fallback: string): string {
  const normalized = color.replace('#', '')

  if (normalized.length === 3) {
    const [r, g, b] = normalized.split('')
    const expanded = `${r}${r}${g}${g}${b}${b}`
    const red = parseInt(expanded.slice(0, 2), 16)
    const green = parseInt(expanded.slice(2, 4), 16)
    const blue = parseInt(expanded.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }

  if (normalized.length === 6) {
    const red = parseInt(normalized.slice(0, 2), 16)
    const green = parseInt(normalized.slice(2, 4), 16)
    const blue = parseInt(normalized.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }

  return fallback
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitCard({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  isJustCreated = false,
  showAddSubHabit = false,
  hasChildren = false,
  hasSubHabits = false,
  isExpanded = true,
  isLastChild = false,
  childrenDone = 0,
  childrenTotal = 0,
  searchQuery = '',
  onLog,
  onUnlog,
  onSkip,
  onDelete,
  onDuplicate,
  onMoveParent,
  onDetail,
  onDrillInto,
  onToggleSelection,
  onAddSubHabit,
  onToggleExpand,
  onForceLogParent,
  onEnterSelectMode,
}: HabitCardProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const { displayTime } = useTimeFormat()
  const styles = useMemo(() => createStyles(colors), [colors])

  const isChild = depth > 0
  const checkedCount =
    habit.checklistItems?.filter((i) => i.isChecked).length ?? 0

  // Computed values
  const isDoneForRange = habit.isCompleted || habit.isLoggedInRange

  const status = useMemo(() => {
    if (isDoneForRange) return 'completed' as const
    if (habit.isGeneral) return 'pending' as const
    if (habit.isOverdue && !habit.frequencyUnit) return 'overdue' as const
    const selectedDateStr = formatAPIDate(selectedDate ?? new Date())
    const hasTodaySchedule =
      habit.instances?.some((i) => i.date === selectedDateStr) ?? false
    if (hasTodaySchedule) return 'due-today' as const
    return 'pending' as const
  }, [isDoneForRange, habit, selectedDate])

  const canSkip =
    !habit.isGeneral &&
    !habit.isCompleted &&
    (status === 'due-today' || status === 'overdue')

  const isPostpone = !habit.frequencyUnit

  const statusBadge = useMemo(() => {
    if (status === 'overdue') {
      return { text: t('habits.overdue') }
    }
    return null
  }, [status, t])

  const isNotDueToday = useMemo(() => {
    if (!selectedDate) return false
    if (status !== 'pending') return false
    return true
  }, [selectedDate, status])

  const isParentWithChildren = hasChildren && childrenTotal > 0
  const progressPercent =
    childrenTotal === 0
      ? 0
      : Math.round((childrenDone / childrenTotal) * 100)

  // Frequency label
  const frequencyLabel = useMemo(() => {
    if (habit.isGeneral) return t('habits.generalHabit')
    const { frequencyUnit, frequencyQuantity, days, isFlexible } = habit
    if (!frequencyUnit) return t('habits.oneTimeTask')
    if (isFlexible) {
      return t('habits.frequency.flexibleLabel', {
        n: frequencyQuantity ?? 1,
        unit: t(`habits.form.unit${frequencyUnit}`),
      })
    }
    if (frequencyQuantity === 1 && days.length > 0) {
      return days
        .map((day) => t(`dates.daysShort.${day.toLowerCase()}`))
        .join(', ')
    }
    if (frequencyQuantity === 1)
      return t(`habits.frequency.every${frequencyUnit}`)
    return plural(
      t(`habits.frequency.everyN${frequencyUnit}s`, {
        n: frequencyQuantity ?? 1,
      }),
      frequencyQuantity ?? 1,
    )
  }, [habit, t])

  // Flexible progress label
  const flexibleProgressLabel = useMemo(() => {
    if (!habit.isFlexible) return null
    const target = habit.flexibleTarget ?? habit.frequencyQuantity ?? 1
    const done = habit.flexibleCompleted ?? 0
    const unit = habit.frequencyUnit
      ? t(`habits.form.unit${habit.frequencyUnit}`)
      : ''
    return t('habits.frequency.flexibleProgress', { done, target, unit })
  }, [habit, t])

  // Actions menu
  const [showActionsMenu, setShowActionsMenu] = useState(false)

  const closeActionsMenu = useCallback(() => setShowActionsMenu(false), [])
  const toggleActionsMenu = useCallback(
    () => setShowActionsMenu((prev) => !prev),
    [],
  )

  // Close menu on select mode
  useEffect(() => {
    if (isSelectMode) setShowActionsMenu(false)
  }, [isSelectMode])

  const handleCardPress = useCallback(() => {
    if (isSelectMode) {
      onToggleSelection?.()
    } else {
      onDetail?.()
    }
  }, [isSelectMode, onToggleSelection, onDetail])

  // Dynamic card styles
  const cardStyle: ViewStyle[] = [
    isChild ? styles.cardChild : styles.cardParent,
  ]

  // Status border for due-today / overdue (parent only)
  if (!isChild && status === 'due-today') {
    cardStyle.push(styles.cardDueToday)
  }
  if (!isChild && status === 'overdue') {
    cardStyle.push(styles.cardOverdue)
  }

  // Dimming for completed / not-due
  if (isDoneForRange || isNotDueToday) {
    cardStyle.push(styles.cardDimmed)
  }

  // Selected ring
  if (isSelected) {
    cardStyle.push(styles.cardSelected)
  }

  // Indent for children
  const indentMargin = depth > 0 ? { marginLeft: depth * 24 } : undefined

  return (
    <View style={indentMargin}>
      <TouchableOpacity
        style={cardStyle}
        onPress={handleCardPress}
        onLongPress={
          !isSelectMode && onEnterSelectMode
            ? onEnterSelectMode
            : undefined
        }
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.cardRow,
            { gap: isChild ? 12 : 14 },
          ]}
        >
          {/* Expand/collapse toggle */}
          {hasChildren && (
            <TouchableOpacity
              onPress={(e) => {
                onToggleExpand?.()
              }}
              style={[
                styles.expandButton,
                {
                  width: isChild ? 24 : 28,
                  height: isChild ? 24 : 28,
                  borderRadius: 8,
                },
                isExpanded && styles.expandButtonRotated,
              ]}
              activeOpacity={0.7}
            >
              <ChevronRight
                size={isChild ? 14 : 16}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}

          {/* Selection checkbox */}
          {isSelectMode ? (
            <TouchableOpacity
              onPress={onToggleSelection}
              style={[
                styles.selectionCircle,
                {
                  width: isChild ? 32 : 44,
                  height: isChild ? 32 : 44,
                  borderRadius: isChild ? 16 : 22,
                },
                isSelected
                  ? styles.selectionCircleSelected
                  : styles.selectionCircleDefault,
              ]}
              activeOpacity={0.7}
            >
              {isSelected && (
                <Check size={isChild ? 16 : 20} color={colors.white} />
              )}
            </TouchableOpacity>
          ) : isParentWithChildren ? (
            /* Progress ring for parent habits */
            <TouchableOpacity
              onPress={() => {
                if (isNotDueToday) return
                if (isDoneForRange) {
                  onUnlog?.()
                } else if (childrenDone >= childrenTotal) {
                  onLog?.()
                } else {
                  onForceLogParent?.()
                }
              }}
              style={[
                styles.progressRingContainer,
                {
                  width: isChild ? 32 : 44,
                  height: isChild ? 32 : 44,
                },
              ]}
              activeOpacity={0.8}
            >
              {/* Background ring */}
              <View
                style={[
                  styles.ringTrack,
                  {
                    width: isChild ? 32 : 44,
                    height: isChild ? 32 : 44,
                    borderRadius: isChild ? 16 : 22,
                    borderWidth: 2,
                    borderColor: colors.borderMuted,
                  },
                ]}
              />
              {/* Progress ring approximation */}
              <View
                style={[
                  styles.ringProgress,
                  {
                    width: isChild ? 32 : 44,
                    height: isChild ? 32 : 44,
                    borderRadius: isChild ? 16 : 22,
                    borderWidth: 2.5,
                    borderColor:
                      isDoneForRange || progressPercent === 100
                        ? colors.primary
                        : `${colors.primary}99`,
                    opacity: isDoneForRange ? 1 : progressPercent / 100,
                  },
                ]}
              />
              {/* Center content */}
              {isDoneForRange ? (
                <Check size={16} color={colors.primary} />
              ) : (
                <Text style={styles.progressText}>
                  {childrenDone}/{childrenTotal}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            /* Log button (circle indicator) */
            <TouchableOpacity
              onPress={() => {
                if (isDoneForRange) {
                  onUnlog?.()
                } else {
                  onLog?.()
                }
              }}
              style={[
                styles.logButton,
                {
                  width: isChild ? 32 : 44,
                  height: isChild ? 32 : 44,
                  borderRadius: isChild ? 16 : 22,
                },
                isDoneForRange
                  ? styles.logButtonDone
                  : status === 'overdue'
                    ? styles.logButtonOverdue
                    : styles.logButtonDefault,
              ]}
              activeOpacity={0.8}
            >
              {isDoneForRange && (
                <Check
                  size={isChild ? 14 : 16}
                  color={colors.white}
                />
              )}
            </TouchableOpacity>
          )}

          {/* Content */}
          <View style={styles.content}>
            <Text
              style={[
                isChild ? styles.titleChild : styles.titleParent,
                isDoneForRange && styles.titleDone,
              ]}
              numberOfLines={1}
            >
              {habit.title}
            </Text>

            {habit.description ? (
              <Text
                style={[
                  isChild ? styles.descriptionChild : styles.descriptionParent,
                ]}
                numberOfLines={1}
              >
                {habit.description}
              </Text>
            ) : null}

            {/* Badges row */}
            {!isChild ? (
              /* Top-level habit badges */
              <View style={styles.badgesRow}>
                <Text style={styles.frequencyLabel}>{frequencyLabel}</Text>

                {flexibleProgressLabel ? (
                  <View style={styles.badgePrimaryPill}>
                    <Text style={styles.badgePrimaryText}>
                      {flexibleProgressLabel}
                    </Text>
                  </View>
                ) : null}

                {habit.dueTime ? (
                  <Text style={styles.dueTimeText}>
                    {displayTime(habit.dueTime)}
                    {habit.dueEndTime ? ` - ${displayTime(habit.dueEndTime)}` : ''}
                  </Text>
                ) : null}

                {statusBadge ? (
                  <View style={styles.badgeOverdue}>
                    <Text style={styles.badgeOverdueText}>
                      {statusBadge.text}
                    </Text>
                  </View>
                ) : null}

                {habit.isBadHabit ? (
                  <View style={styles.badgeBadHabit}>
                    <Text style={styles.badgeBadHabitText}>
                      {t('habits.badHabit')}
                    </Text>
                  </View>
                ) : null}

                {habit.tags?.map((tag) => (
                  <View
                    key={tag.id}
                    style={[
                      styles.badgeTag,
                      { backgroundColor: tag.color },
                    ]}
                  >
                    <Text style={styles.badgeTagText}>{tag.name}</Text>
                  </View>
                ))}

                {(habit.linkedGoals ?? []).map((goal) => (
                  <View key={goal.id} style={styles.badgePrimaryPill}>
                    <Text style={styles.badgePrimaryText}>{goal.title}</Text>
                  </View>
                ))}

                {habit.currentStreak != null && habit.currentStreak >= 2 ? (
                  <View style={styles.badgeStreak}>
                    <Flame size={12} color={colors.amber400} />
                    <Text style={styles.badgeStreakText}>
                      {habit.currentStreak}
                    </Text>
                  </View>
                ) : null}

                {habit.checklistItems && habit.checklistItems.length > 0 ? (
                  <View style={styles.badgeChecklist}>
                    <ClipboardCheck
                      size={12}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.badgeChecklistText}>
                      {checkedCount}/{habit.checklistItems.length}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : isChild && habit.isBadHabit ? (
              /* Child habit with bad habit badge */
              <View style={styles.badgesRowChild}>
                <View style={styles.badgeBadHabitNoBorder}>
                  <Text style={styles.badgeBadHabitText}>
                    {t('habits.badHabit')}
                  </Text>
                </View>
                {habit.tags?.map((tag) => (
                  <View
                    key={tag.id}
                    style={[styles.badgeTag, { backgroundColor: tag.color }]}
                  >
                    <Text style={styles.badgeTagText}>{tag.name}</Text>
                  </View>
                ))}
                {habit.currentStreak != null && habit.currentStreak >= 2 ? (
                  <View style={styles.badgeStreakNoBorder}>
                    <Flame size={12} color={colors.amber400} />
                    <Text style={styles.badgeStreakText}>
                      {habit.currentStreak}
                    </Text>
                  </View>
                ) : null}
                {habit.checklistItems &&
                  habit.checklistItems.length > 0 ? (
                    <View style={styles.badgeChecklistNoBorder}>
                      <ClipboardCheck
                        size={12}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.badgeChecklistText}>
                        {checkedCount}/{habit.checklistItems.length}
                      </Text>
                    </View>
                  ) : null}
              </View>
            ) : (
              /* Child habit default badges */
              <View style={styles.badgesRowChild}>
                <Text style={styles.frequencyLabelChild}>
                  {frequencyLabel}
                </Text>
                {statusBadge ? (
                  <View style={styles.badgeOverdue}>
                    <Text style={styles.badgeOverdueText}>
                      {statusBadge.text}
                    </Text>
                  </View>
                ) : null}
                {habit.tags?.map((tag) => (
                  <View
                    key={tag.id}
                    style={[styles.badgeTag, { backgroundColor: tag.color }]}
                  >
                    <Text style={styles.badgeTagText}>{tag.name}</Text>
                  </View>
                ))}
                {habit.currentStreak != null && habit.currentStreak >= 2 ? (
                  <View style={styles.badgeStreakNoBorder}>
                    <Flame size={12} color={colors.amber400} />
                    <Text style={styles.badgeStreakText}>
                      {habit.currentStreak}
                    </Text>
                  </View>
                ) : null}
                {habit.checklistItems &&
                  habit.checklistItems.length > 0 ? (
                    <View style={styles.badgeChecklistNoBorder}>
                      <ClipboardCheck
                        size={12}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.badgeChecklistText}>
                        {checkedCount}/{habit.checklistItems.length}
                      </Text>
                    </View>
                  ) : null}
              </View>
            )}
          </View>

          {/* Actions menu trigger */}
          {!isSelectMode && (
            <TouchableOpacity
              onPress={toggleActionsMenu}
              style={[
                styles.moreButton,
                { padding: isChild ? 6 : 8 },
              ]}
              activeOpacity={0.7}
            >
              <MoreVertical
                size={isChild ? 14 : 16}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* Actions menu (inline overlay for RN) */}
      {showActionsMenu && (
        <>
          <TouchableOpacity
            style={styles.menuBackdrop}
            onPress={closeActionsMenu}
            activeOpacity={1}
          />
          <View style={styles.actionsMenu}>
            {showAddSubHabit && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onAddSubHabit?.()
                  closeActionsMenu()
                }}
                activeOpacity={0.7}
              >
                <Plus size={16} color={colors.textMuted} />
                <Text style={styles.menuItemText}>
                  {t('habits.form.addSubHabit')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onMoveParent?.()
                closeActionsMenu()
              }}
              activeOpacity={0.7}
            >
              <ArrowRight size={16} color={colors.textMuted} />
              <Text style={styles.menuItemText}>
                {t('habits.moveParent.button')}
              </Text>
            </TouchableOpacity>

            {canSkip && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onSkip?.()
                  closeActionsMenu()
                }}
                activeOpacity={0.7}
              >
                <FastForward size={16} color={colors.amber400} />
                <Text style={styles.menuItemTextAmber}>
                  {isPostpone
                    ? t('habits.actions.postpone')
                    : t('habits.actions.skip')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onDuplicate?.()
                closeActionsMenu()
              }}
              activeOpacity={0.7}
            >
              <Copy size={16} color={colors.textMuted} />
              <Text style={styles.menuItemText}>
                {t('habits.actions.duplicate')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onEnterSelectMode?.()
                closeActionsMenu()
              }}
              activeOpacity={0.7}
            >
              <CheckCircle2 size={16} color={colors.textMuted} />
              <Text style={styles.menuItemText}>{t('common.select')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onDelete?.()
                closeActionsMenu()
              }}
              activeOpacity={0.7}
            >
              <Trash2 size={16} color={colors.red400} />
              <Text style={styles.menuItemTextDanger}>
                {t('common.delete')}
              </Text>
            </TouchableOpacity>

            {hasSubHabits && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onDrillInto?.()
                  closeActionsMenu()
                }}
                activeOpacity={0.7}
              >
                <ChevronRight size={16} color={colors.textMuted} />
                <Text style={styles.menuItemText}>
                  {t('habits.actions.openSubHabits')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof createColors>) {
  return StyleSheet.create({
  // Parent card -- glass surface with depth (matches .habit-card-parent)
  cardParent: {
    backgroundColor: colors.surface,
    borderRadius: 16, // rounded-2xl
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 16, // p-4
    marginBottom: 10, // space-y-2.5
    // Shadow matching box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.15)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },

  // Child card -- nested surface (matches .habit-card-child)
  cardChild: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary_20,
    paddingVertical: 12, // py-3
    paddingHorizontal: 14, // px-3.5
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },

  // Due-today: amber left border
  cardDueToday: {
    borderLeftWidth: 3,
    borderLeftColor: withAlpha(colors.amber500, 0.7, 'rgba(245, 158, 11, 0.7)'),
  },

  // Overdue: red left border
  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: withAlpha(colors.red500, 0.7, 'rgba(239, 68, 68, 0.7)'),
  },

  // Dimmed for completed / not-due-today
  cardDimmed: {
    opacity: 0.4,
  },

  // Selected ring
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Expand/collapse button
  expandButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandButtonRotated: {
    transform: [{ rotate: '90deg' }],
  },

  // Selection checkbox (circular)
  selectionCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  selectionCircleDefault: {
    borderColor: colors.borderEmphasis,
  },
  selectionCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: 'transparent',
  },

  // Progress ring container
  progressRingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringTrack: {
    position: 'absolute',
  },
  ringProgress: {
    position: 'absolute',
  },
  progressText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Log button
  logButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonDefault: {
    borderWidth: 2,
    borderColor: colors.borderEmphasis,
  },
  logButtonDone: {
    backgroundColor: colors.primary,
    // Glow shadow matching .log-btn-done
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logButtonOverdue: {
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },

  // Content area
  content: {
    flex: 1,
    minWidth: 0,
  },

  // Title - parent
  titleParent: {
    fontSize: 14, // text-sm sm:text-base (mobile = sm)
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Title - child
  titleChild: {
    fontSize: 14, // text-sm
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Title - completed
  titleDone: {
    textDecorationLine: 'line-through',
    textDecorationColor: withAlpha(colors.textMuted, 0.4, 'rgba(122, 116, 144, 0.4)'),
  },

  // Description - parent
  descriptionParent: {
    fontSize: 11, // text-[11px]
    color: colors.textMuted,
    marginTop: 2,
  },

  // Description - child
  descriptionChild: {
    fontSize: 10, // text-[10px]
    color: colors.textMuted,
    marginTop: 2,
  },

  // Badges row - parent
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // gap-1.5
    marginTop: 6, // mt-1.5
    flexWrap: 'wrap',
  },

  // Badges row - child
  badgesRowChild: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2, // mt-0.5
    flexWrap: 'wrap',
  },

  // Frequency label - parent
  frequencyLabel: {
    fontSize: 10, // text-[10px]
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.6, // tracking-widest
    color: withAlpha(colors.textMuted, 0.7, 'rgba(122, 116, 144, 0.7)'),
  },

  // Frequency label - child
  frequencyLabelChild: {
    fontSize: 9, // text-[9px]
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: withAlpha(colors.textMuted, 0.6, 'rgba(122, 116, 144, 0.6)'),
  },

  // Due time text
  dueTimeText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // Badge: primary pill (flexible progress, linked goals, match badges)
  badgePrimaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8, // px-2
    paddingVertical: 2, // py-0.5
    borderRadius: 9999,
    backgroundColor: colors.primary_10,
    borderWidth: 1,
    borderColor: colors.primary_20,
  },
  badgePrimaryText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },

  // Badge: overdue
  badgeOverdue: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: colors.red500_10,
  },
  badgeOverdueText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.red400, // text-red-500
  },

  // Badge: bad habit
  badgeBadHabit: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: colors.red500_10,
    borderWidth: 1,
    borderColor: colors.red500_30,
  },
  badgeBadHabitNoBorder: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: colors.red500_10,
  },
  badgeBadHabitText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.red400,
  },

  // Badge: tag
  badgeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  badgeTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)', // text-white/95
  },

  // Badge: streak
  badgeStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: withAlpha(colors.amber400, 0.1, 'rgba(251, 191, 36, 0.1)'),
    borderWidth: 1,
    borderColor: withAlpha(colors.amber400, 0.2, 'rgba(251, 191, 36, 0.2)'),
  },
  badgeStreakNoBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: withAlpha(colors.amber400, 0.1, 'rgba(251, 191, 36, 0.1)'),
  },
  badgeStreakText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.amber400,
  },

  // Badge: checklist
  badgeChecklist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: withAlpha(colors.surfaceElevated, 0.88, colors.surfaceElevated),
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  badgeChecklistNoBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: withAlpha(colors.surfaceElevated, 0.88, colors.surfaceElevated),
  },
  badgeChecklistText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // More button (three dots)
  moreButton: {
    borderRadius: 9999,
  },

  // Actions menu
  menuBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 69,
  },
  actionsMenu: {
    position: 'absolute',
    right: 0,
    top: '100%' as unknown as number,
    zIndex: 70,
    minWidth: 192, // min-w-[12rem]
    borderRadius: 16, // rounded-2xl
    padding: 6, // p-1.5
    backgroundColor: colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // gap-3
    paddingHorizontal: 12, // px-3
    paddingVertical: 10, // py-2.5
    borderRadius: 12, // rounded-xl
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  menuItemTextAmber: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.amber400,
  },
  menuItemTextDanger: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.red400,
  },
  menuDivider: {
    height: 1,
    marginVertical: 4, // my-1
    marginHorizontal: 8, // mx-2
    backgroundColor: colors.borderMuted,
  },
  })
}
