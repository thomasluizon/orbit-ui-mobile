import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTourTarget } from '@/hooks/use-tour-target'
import {
  ChevronRight,
  Check,
  MoreVertical,
  Plus,
  ArrowRight,
  FastForward,
  Copy,
  Pencil,
  CheckCircle2,
  Trash2,
  ClipboardCheck,
  Flame,
} from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import {
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitStatusBadge,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { AnchoredMenu } from '@/components/ui/anchored-menu'
import { useTimeFormat } from '@/hooks/use-time-format'
import type { MenuAnchorRect } from '@/lib/anchored-menu'
import { getHabitProgressStrokeDasharray } from '@/lib/habit-progress'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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

function HabitCardSurface({
  isChild,
  colors,
}: Readonly<{
  isChild: boolean
  colors: ReturnType<typeof createColors>
}>) {
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
          },
          {
            backgroundColor: withAlpha(
              colors.white,
              isChild ? 0.03 : 0.05,
              isChild ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)',
            ),
          },
        ]}
      />
    </>
  )
}

function HabitBadge({
  children,
  style,
}: Readonly<{
  children: ReactNode
  style: StyleProp<ViewStyle>
}>) {
  return <View style={style}>{children}</View>
}

function HabitBadgesRow({
  isChild,
  habit,
  frequencyLabel,
  flexibleProgressLabel,
  statusBadge,
  checkedCount,
  colors,
  t,
  styles,
  displayTime,
  tagsRef,
}: Readonly<{
  isChild: boolean
  habit: NormalizedHabit
  frequencyLabel: string
  flexibleProgressLabel: string | null
  statusBadge: { text: string } | null
  checkedCount: number
  colors: ReturnType<typeof createColors>
  t: ReturnType<typeof useTranslation>['t']
  styles: ReturnType<typeof createStyles>
  displayTime: (value: string | null | undefined) => string
  tagsRef?: React.RefObject<View | null>
}>) {
  if (!isChild) {
    return (
      <View ref={tagsRef} style={styles.badgesRow}>
        <Text style={styles.frequencyLabel}>{frequencyLabel}</Text>

        {flexibleProgressLabel ? (
          <HabitBadge style={styles.badgePrimaryPill}>
            <Text style={styles.badgePrimaryText}>{flexibleProgressLabel}</Text>
          </HabitBadge>
        ) : null}

        {habit.dueTime ? (
          <Text style={styles.dueTimeText}>
            {displayTime(habit.dueTime)}
            {habit.dueEndTime ? ` - ${displayTime(habit.dueEndTime)}` : ''}
          </Text>
        ) : null}

        {statusBadge ? (
          <HabitBadge style={styles.badgeOverdue}>
            <Text style={styles.badgeOverdueText}>{statusBadge.text}</Text>
          </HabitBadge>
        ) : null}

        {habit.isBadHabit ? (
          <HabitBadge style={styles.badgeBadHabit}>
            <Text style={styles.badgeBadHabitText}>{t('habits.badHabit')}</Text>
          </HabitBadge>
        ) : null}

        {habit.tags?.map((tag) => (
          <HabitBadge
            key={tag.id}
            style={[styles.badgeTag, { backgroundColor: tag.color }]}
          >
            <Text style={styles.badgeTagText}>{tag.name}</Text>
          </HabitBadge>
        ))}

        {(habit.linkedGoals ?? []).map((goal) => (
          <HabitBadge key={goal.id} style={styles.badgePrimaryPill}>
            <Text style={styles.badgePrimaryText}>{goal.title}</Text>
          </HabitBadge>
        ))}

        {habit.currentStreak != null && habit.currentStreak >= 2 ? (
          <HabitBadge style={styles.badgeStreak}>
            <Flame size={12} color={colors.amber400} />
            <Text style={styles.badgeStreakText}>{habit.currentStreak}</Text>
          </HabitBadge>
        ) : null}

        {habit.checklistItems && habit.checklistItems.length > 0 ? (
          <HabitBadge style={styles.badgeChecklist}>
            <ClipboardCheck size={12} color={colors.textSecondary} />
            <Text style={styles.badgeChecklistText}>
              {checkedCount}/{habit.checklistItems.length}
            </Text>
          </HabitBadge>
        ) : null}
      </View>
    )
  }

  if (habit.isBadHabit) {
    return (
      <View style={styles.badgesRowChild}>
        <HabitBadge style={styles.badgeBadHabitNoBorder}>
          <Text style={styles.badgeBadHabitText}>{t('habits.badHabit')}</Text>
        </HabitBadge>
        {habit.tags?.map((tag) => (
          <HabitBadge
            key={tag.id}
            style={[styles.badgeTag, { backgroundColor: tag.color }]}
          >
            <Text style={styles.badgeTagText}>{tag.name}</Text>
          </HabitBadge>
        ))}
        {habit.currentStreak != null && habit.currentStreak >= 2 ? (
          <HabitBadge style={styles.badgeStreakNoBorder}>
            <Flame size={12} color={colors.amber400} />
            <Text style={styles.badgeStreakText}>{habit.currentStreak}</Text>
          </HabitBadge>
        ) : null}
        {habit.checklistItems && habit.checklistItems.length > 0 ? (
          <HabitBadge style={styles.badgeChecklistNoBorder}>
            <ClipboardCheck size={12} color={colors.textSecondary} />
            <Text style={styles.badgeChecklistText}>
              {checkedCount}/{habit.checklistItems.length}
            </Text>
          </HabitBadge>
        ) : null}
      </View>
    )
  }

  return (
    <View style={styles.badgesRowChild}>
      <Text style={styles.frequencyLabelChild}>{frequencyLabel}</Text>
      {statusBadge ? (
        <HabitBadge style={styles.badgeOverdue}>
          <Text style={styles.badgeOverdueText}>{statusBadge.text}</Text>
        </HabitBadge>
      ) : null}
      {habit.tags?.map((tag) => (
        <HabitBadge
          key={tag.id}
          style={[styles.badgeTag, { backgroundColor: tag.color }]}
        >
          <Text style={styles.badgeTagText}>{tag.name}</Text>
        </HabitBadge>
      ))}
      {habit.currentStreak != null && habit.currentStreak >= 2 ? (
        <HabitBadge style={styles.badgeStreakNoBorder}>
          <Flame size={12} color={colors.amber400} />
          <Text style={styles.badgeStreakText}>{habit.currentStreak}</Text>
        </HabitBadge>
      ) : null}
      {habit.checklistItems && habit.checklistItems.length > 0 ? (
        <HabitBadge style={styles.badgeChecklistNoBorder}>
          <ClipboardCheck size={12} color={colors.textSecondary} />
          <Text style={styles.badgeChecklistText}>
            {checkedCount}/{habit.checklistItems.length}
          </Text>
        </HabitBadge>
      ) : null}
    </View>
  )
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
  actions = {},
  tourTargetId,
}: HabitCardProps) {
  const {
    onLog,
    onUnlog,
    onSkip,
    onDelete,
    onDuplicate,
    onEdit,
    onMoveParent,
    onDetail,
    onDrillInto,
    onToggleSelection,
    onAddSubHabit,
    onToggleExpand,
    onForceLogParent,
    onEnterSelectMode,
    onLongPressCard,
  } = actions
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const { displayTime } = useTimeFormat()
  const styles = useMemo(() => createStyles(colors), [colors])

  const cardTourRef = useRef<View>(null)
  const tagsTourRef = useRef<View>(null)
  useTourTarget(tourTargetId ?? '__noop__', cardTourRef)
  // When this card is the tour target, also register it as tour-habit-card
  useTourTarget(tourTargetId ? 'tour-habit-card' : '__noop__', cardTourRef)
  useTourTarget(tourTargetId ? 'tour-habit-tags' : '__noop__', tagsTourRef)

  const isChild = depth > 0
  const checkedCount =
    habit.checklistItems?.filter((i) => i.isChecked).length ?? 0

  // Computed values
  const isDoneForRange = habit.isCompleted || habit.isLoggedInRange

  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const canSkip =
    !habit.isGeneral &&
    !habit.isCompleted &&
    (status === 'due-today' || status === 'overdue')

  const isPostpone = !habit.frequencyUnit

  const statusBadge = useMemo(
    () => computeHabitStatusBadge(status, t),
    [status, t],
  )

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
  const frequencyLabel = useMemo(
    () => computeHabitFrequencyLabel(habit, t),
    [habit, t],
  )

  // Flexible progress label
  const flexibleProgressLabel = useMemo(
    () => computeHabitFlexibleProgressLabel(habit, t),
    [habit, t],
  )

  // Actions menu
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [actionsMenuAnchorRect, setActionsMenuAnchorRect] =
    useState<MenuAnchorRect | null>(null)
  const actionsButtonRef = useRef<View>(null)

  const closeActionsMenu = useCallback(() => {
    setShowActionsMenu(false)
  }, [])

  const openActionsMenu = useCallback(() => {
    actionsButtonRef.current?.measureInWindow((x, y, width, height) => {
      setActionsMenuAnchorRect({ x, y, width, height })
      setShowActionsMenu(true)
    })
  }, [])

  const toggleActionsMenu = useCallback(() => {
    if (showActionsMenu) {
      closeActionsMenu()
      return
    }

    openActionsMenu()
  }, [closeActionsMenu, openActionsMenu, showActionsMenu])

  // Close menu on select mode
  useEffect(() => {
    if (isSelectMode) setShowActionsMenu(false)
  }, [isSelectMode])

  const handleEnterSelectModeFromMenu = useCallback(() => {
    closeActionsMenu()
    setTimeout(() => {
      onEnterSelectMode?.()
    }, 0)
  }, [closeActionsMenu, onEnterSelectMode])

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
  } else if (isJustCreated) {
    cardStyle.push(styles.cardJustCreated)
  }

  // Indent for children
  const indentMargin = depth > 0 ? { marginLeft: depth * 24 } : undefined

  return (
    <View style={indentMargin} ref={tourTargetId ? cardTourRef : undefined}>
      <TouchableOpacity
        style={cardStyle}
        onPress={handleCardPress}
        onLongPress={!isSelectMode ? onLongPressCard : undefined}
        delayLongPress={300}
        activeOpacity={0.85}
      >
        <HabitCardSurface isChild={isChild} colors={colors} />
        <View
          style={[
            styles.cardRow,
            { gap: isChild ? 12 : 14 },
          ]}
        >
          {/* Expand/collapse toggle */}
          {hasChildren && (
            <TouchableOpacity
              onPress={onToggleExpand}
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
              <Svg
                style={[
                  styles.progressRingSvg,
                  {
                    width: isChild ? 32 : 44,
                    height: isChild ? 32 : 44,
                  },
                ]}
                viewBox="0 0 36 36"
              >
                <Circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={colors.borderMuted}
                  strokeWidth="2"
                />
                <Circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={
                    isDoneForRange || progressPercent === 100
                      ? colors.primary
                      : withAlpha(
                          colors.primary,
                          0.6,
                          'rgba(59, 130, 246, 0.6)',
                        )
                  }
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={getHabitProgressStrokeDasharray(
                    progressPercent,
                    isDoneForRange,
                  )}
                />
              </Svg>
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

              <HabitBadgesRow
                isChild={isChild}
                habit={habit}
                frequencyLabel={frequencyLabel}
                flexibleProgressLabel={flexibleProgressLabel}
                statusBadge={statusBadge}
                checkedCount={checkedCount}
                colors={colors}
                t={t}
                styles={styles}
                displayTime={displayTime}
                tagsRef={tourTargetId ? tagsTourRef : undefined}
              />
            </View>

          {/* Actions menu trigger */}
          {!isSelectMode && (
            <View ref={actionsButtonRef} collapsable={false}>
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
            </View>
          )}
        </View>
      </TouchableOpacity>

      <AnchoredMenu
        visible={showActionsMenu}
        anchorRect={actionsMenuAnchorRect}
        onClose={closeActionsMenu}
        width={208}
        estimatedHeight={hasSubHabits ? 320 : 276}
      >
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
            onEdit?.()
            closeActionsMenu()
          }}
          activeOpacity={0.7}
        >
          <Pencil size={16} color={colors.textMuted} />
          <Text style={styles.menuItemText}>{t('common.edit')}</Text>
        </TouchableOpacity>

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
          onPress={handleEnterSelectModeFromMenu}
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
      </AnchoredMenu>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof createColors>) {
  return StyleSheet.create({
  cardParent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.06, 'rgba(255, 255, 255, 0.06)'),
    padding: 16,
    marginBottom: 10,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 5,
  },

  cardChild: {
    backgroundColor: withAlpha(colors.surfaceGround, 0.6, colors.surfaceGround),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.04, 'rgba(255, 255, 255, 0.04)'),
    borderLeftWidth: 2,
    borderLeftColor: withAlpha(colors.primary, 0.25, 'rgba(59, 130, 246, 0.25)'),
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },

  cardDueToday: {
    borderLeftWidth: 3,
    borderLeftColor: withAlpha(colors.amber500, 0.7, 'rgba(245, 158, 11, 0.7)'),
    borderColor: withAlpha(colors.white, 0.06, 'rgba(255, 255, 255, 0.06)'),
  },

  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: withAlpha(colors.red500, 0.7, 'rgba(239, 68, 68, 0.7)'),
    borderColor: withAlpha(colors.white, 0.06, 'rgba(255, 255, 255, 0.06)'),
  },

  cardDimmed: {
    opacity: 0.4,
  },

  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cardJustCreated: {
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
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
  progressRingSvg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
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
