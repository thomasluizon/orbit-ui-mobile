import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  FastForward,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitMatchBadges,
  computeHabitStatusBadge,
  getHabitProgressRatio,
  shouldShowHabitProgressArc,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTourTarget } from '@/hooks/use-tour-target'
import { AnchoredMenu } from '@/components/ui/anchored-menu'
import { HabitAvatarTile } from '@/components/habits/habit-avatar-tile'
import { HabitMetaRow } from '@/components/habits/habit-meta-row'
import type { MenuAnchorRect } from '@/lib/anchored-menu'
import { createColors, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useTimeFormat } from '@/hooks/use-time-format'

/**
 * Warm coral for overdue state (not hot alarm red). Mirrors
 * `--habit-status-coral` on web. Kept local because the mobile theme
 * does not yet export a dedicated coral token.
 */
const STATUS_CORAL = 'rgb(248, 113, 113)'

// ---------------------------------------------------------------------------
// Types
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
  childrenDone = 0,
  childrenTotal = 0,
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
  const { colors, currentTheme } = useAppTheme()
  const { displayTime } = useTimeFormat()
  const styles = useMemo(() => createStyles(colors, currentTheme), [colors, currentTheme])

  const cardTourRef = useRef<View>(null)
  const tagsTourRef = useRef<View>(null)
  useTourTarget(tourTargetId ?? '__noop__', cardTourRef)
  useTourTarget(tourTargetId ? 'tour-habit-card' : '__noop__', cardTourRef)
  useTourTarget(tourTargetId ? 'tour-habit-tags' : '__noop__', tagsTourRef)

  const isChild = depth > 0
  const isCompletedForRange = habit.isCompleted || habit.isLoggedInRange
  const checkedCount = habit.checklistItems?.filter((i) => i.isChecked).length ?? 0

  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const canSkip =
    !habit.isGeneral &&
    !habit.isCompleted &&
    (status === 'due-today' || status === 'overdue')
  const isPostpone = !habit.frequencyUnit

  const statusBadge = useMemo(() => computeHabitStatusBadge(status, t), [status, t])

  const isNotDueToday = useMemo(() => {
    if (!selectedDate) return false
    if (habit.isGeneral) return false
    return status === 'pending'
  }, [habit.isGeneral, selectedDate, status])

  const isParentWithChildren = hasChildren && childrenTotal > 0
  const childRatio = childrenTotal === 0 ? 0 : childrenDone / childrenTotal
  const progressRatio = useMemo(
    () =>
      getHabitProgressRatio(habit, {
        hasChildren: isParentWithChildren,
        childrenDone,
        childrenTotal,
      }),
    [habit, isParentWithChildren, childrenDone, childrenTotal],
  )
  const showArc = useMemo(
    () =>
      shouldShowHabitProgressArc(habit, {
        hasChildren: isParentWithChildren,
        childrenTotal,
      }),
    [habit, isParentWithChildren, childrenTotal],
  )

  const frequencyLabel = useMemo(
    () => computeHabitFrequencyLabel(habit, t),
    [habit, t],
  )
  const flexibleProgressLabel = useMemo(
    () => computeHabitFlexibleProgressLabel(habit, t),
    [habit, t],
  )
  const matchBadges = useMemo(
    () => computeHabitMatchBadges('', habit, t),
    [habit, t],
  )

  // ---------------------------------------------------------------------------
  // Press-in scale animation (outer card body)
  // ---------------------------------------------------------------------------

  const pressScale = useSharedValue(1)
  const pressAnim = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))
  const handlePressIn = useCallback(() => {
    // Restrained press-in — 0.985 reads as a confident touch, not a bounce.
    pressScale.value = withTiming(0.985, { duration: 100, easing: Easing.out(Easing.ease) })
  }, [pressScale])
  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, { stiffness: 240, damping: 20 })
  }, [pressScale])

  // Pulse / glow flags for the avatar tile
  const [tilePulse, setTilePulse] = useState(false)
  const [tileGlow, setTileGlow] = useState(false)
  const prevDoneRef = useRef(isCompletedForRange)
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isCompletedForRange && !prevDoneRef.current) {
      setTilePulse(true)
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current)
      pulseTimerRef.current = setTimeout(() => setTilePulse(false), 500)
    }
    prevDoneRef.current = isCompletedForRange
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current)
    }
  }, [isCompletedForRange])

  useEffect(() => {
    if (!isJustCreated) return
    setTileGlow(true)
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
    glowTimerRef.current = setTimeout(() => setTileGlow(false), 1500)
    return () => {
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
    }
  }, [isJustCreated])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleTilePress = useCallback(() => {
    if (isSelectMode) {
      onToggleSelection?.()
      return
    }
    if (isCompletedForRange) {
      onUnlog?.()
      return
    }
    if (isParentWithChildren && childrenDone < childrenTotal) {
      onForceLogParent?.()
      return
    }
    onLog?.()
  }, [
    isSelectMode,
    isCompletedForRange,
    isParentWithChildren,
    childrenDone,
    childrenTotal,
    onToggleSelection,
    onUnlog,
    onForceLogParent,
    onLog,
  ])

  const handleCardPress = useCallback(() => {
    if (isSelectMode) {
      onToggleSelection?.()
    } else {
      onDetail?.()
    }
  }, [isSelectMode, onToggleSelection, onDetail])

  // ---------------------------------------------------------------------------
  // Menu state
  // ---------------------------------------------------------------------------

  const [showMenu, setShowMenu] = useState(false)
  const [anchorRect, setAnchorRect] = useState<MenuAnchorRect | null>(null)
  const menuBtnRef = useRef<View>(null)
  const closeMenu = useCallback(() => setShowMenu(false), [])
  const openMenu = useCallback(() => {
    menuBtnRef.current?.measureInWindow((x, y, width, height) => {
      setAnchorRect({ x, y, width, height })
      setShowMenu(true)
    })
  }, [])
  const toggleMenu = useCallback(() => {
    if (showMenu) closeMenu()
    else openMenu()
  }, [showMenu, openMenu, closeMenu])

  useEffect(() => {
    if (isSelectMode) setShowMenu(false)
  }, [isSelectMode])

  // ---------------------------------------------------------------------------
  // Card container style
  // ---------------------------------------------------------------------------

  const containerStyle: ViewStyle[] = [
    isChild ? styles.cardChild : styles.cardParent,
  ]
  if (!isChild && status === 'due-today') containerStyle.push(styles.statusDue)
  if (!isChild && status === 'overdue') containerStyle.push(styles.statusOverdue)
  if (isCompletedForRange) containerStyle.push(styles.completed)
  else if (isNotDueToday) containerStyle.push(styles.dimmed)
  if (isSelected) containerStyle.push(styles.selected)

  const indentMargin = depth > 0 ? { marginLeft: depth * 24 } : undefined
  const tileCenter =
    isParentWithChildren && !isCompletedForRange
      ? `${childrenDone}/${childrenTotal}`
      : null

  return (
    <View style={indentMargin} ref={tourTargetId ? cardTourRef : undefined}>
      <Animated.View style={pressAnim}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleCardPress}
          onLongPress={!isSelectMode ? onLongPressCard : undefined}
          delayLongPress={300}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={containerStyle}
        >
          <View style={styles.row}>
            {/* Expand/collapse toggle — only when there are children */}
            {hasChildren ? (
              <TouchableOpacity
                onPress={onToggleExpand}
                style={[
                  styles.expandBtn,
                  isExpanded ? styles.expandBtnOpen : null,
                ]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? t('common.collapse') : t('common.expand')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ChevronRight size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}

            {/* Avatar tile or selection checkbox */}
            {isSelectMode ? (
              <TouchableOpacity
                onPress={onToggleSelection}
                style={[
                  styles.selectionBox,
                  isSelected ? styles.selectionBoxFilled : styles.selectionBoxEmpty,
                ]}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={t('common.select')}
              >
                {isSelected ? (
                  <CheckCircle2 size={24} color={colors.textInverse} />
                ) : null}
              </TouchableOpacity>
            ) : (
              <HabitAvatarTile
                icon={habit.icon}
                title={habit.title}
                size={isChild ? 'sm' : 'md'}
                isCompleted={isCompletedForRange}
                isOverdue={status === 'overdue'}
                isBadHabit={!!habit.isBadHabit}
                showArc={showArc && !isChild}
                progressRatio={isParentWithChildren ? childRatio : progressRatio}
                centerLabel={tileCenter}
                showCheckBadge={isCompletedForRange}
                isDisabled={isNotDueToday && !isCompletedForRange}
                pulse={tilePulse}
                glow={tileGlow}
                onPress={handleTilePress}
                accessibilityLabel={
                  isCompletedForRange
                    ? t('habits.actions.unlog', { title: habit.title })
                    : t('habits.log.title')
                }
              />
            )}

            {/* Body */}
            <View style={styles.body}>
              <Text
                style={[
                  styles.title,
                  isCompletedForRange ? styles.titleDone : null,
                ]}
                numberOfLines={1}
              >
                {habit.title}
              </Text>
              {habit.description ? (
                <Text style={styles.description} numberOfLines={1}>
                  {habit.description}
                </Text>
              ) : null}
              <HabitMetaRow
                habit={habit}
                isChild={isChild}
                isCompleted={isCompletedForRange}
                frequencyLabel={frequencyLabel}
                flexibleProgressLabel={flexibleProgressLabel}
                statusBadge={statusBadge}
                status={status}
                checkedCount={checkedCount}
                matchBadges={matchBadges}
                displayTime={displayTime}
                tagsRef={tourTargetId ? tagsTourRef : undefined}
              />
            </View>

            {/* Kebab */}
            {!isSelectMode ? (
              <View ref={menuBtnRef} collapsable={false}>
                <TouchableOpacity
                  onPress={toggleMenu}
                  style={styles.menuBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.moreActions')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MoreVertical size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* 1px top-edge highlight for depth */}
          <View style={styles.topHighlight} pointerEvents="none" />

          {/* Checklist progress strip */}
          {habit.checklistItems && habit.checklistItems.length > 0 ? (
            <ChecklistProgressStrip
              done={checkedCount}
              total={habit.checklistItems.length}
              isCompleted={isCompletedForRange}
              colors={colors}
            />
          ) : null}

          {/* Left status bar for due-today / overdue. Warm coral for overdue
              (urgent but not alarming). */}
          {!isChild && status === 'due-today' ? (
            <View style={[styles.leftBar, { backgroundColor: colors.primary }]} pointerEvents="none" />
          ) : null}
          {!isChild && status === 'overdue' ? (
            <View style={[styles.leftBar, { backgroundColor: STATUS_CORAL }]} pointerEvents="none" />
          ) : null}
        </TouchableOpacity>
      </Animated.View>

      <AnchoredMenu
        visible={showMenu}
        anchorRect={anchorRect}
        onClose={closeMenu}
        width={208}
        estimatedHeight={hasSubHabits ? 320 : 276}
      >
        {showAddSubHabit ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onAddSubHabit?.()
              closeMenu()
            }}
            activeOpacity={0.7}
          >
            <Plus size={16} color={colors.textMuted} />
            <Text style={styles.menuItemText}>{t('habits.form.addSubHabit')}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            onMoveParent?.()
            closeMenu()
          }}
          activeOpacity={0.7}
        >
          <ArrowRight size={16} color={colors.textMuted} />
          <Text style={styles.menuItemText}>{t('habits.moveParent.button')}</Text>
        </TouchableOpacity>

        {canSkip ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onSkip?.()
              closeMenu()
            }}
            activeOpacity={0.7}
          >
            <FastForward size={16} color={colors.amber400} />
            <Text style={styles.menuItemTextAmber}>
              {isPostpone ? t('habits.actions.postpone') : t('habits.actions.skip')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            onEdit?.()
            closeMenu()
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
            closeMenu()
          }}
          activeOpacity={0.7}
        >
          <Copy size={16} color={colors.textMuted} />
          <Text style={styles.menuItemText}>{t('habits.actions.duplicate')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            closeMenu()
            setTimeout(() => onEnterSelectMode?.(), 0)
          }}
          activeOpacity={0.7}
        >
          <CheckCircle2 size={16} color={colors.textMuted} />
          <Text style={styles.menuItemText}>{t('common.select')}</Text>
        </TouchableOpacity>

        {hasSubHabits ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onDrillInto?.()
              closeMenu()
            }}
            activeOpacity={0.7}
          >
            <ChevronRight size={16} color={colors.textMuted} />
            <Text style={styles.menuItemText}>
              {t('habits.actions.openSubHabits')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.menuDivider} />

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => {
            onDelete?.()
            closeMenu()
          }}
          activeOpacity={0.7}
        >
          <Trash2 size={16} color={colors.red400} />
          <Text style={styles.menuItemTextDanger}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </AnchoredMenu>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function ChecklistProgressStrip({
  done,
  total,
  isCompleted,
  colors,
}: Readonly<{
  done: number
  total: number
  isCompleted: boolean
  colors: ReturnType<typeof createColors>
}>) {
  if (total === 0) return null
  const ratio = isCompleted ? 1 : Math.max(0, Math.min(1, done / total))
  const widthPct: import('react-native').DimensionValue = `${(ratio * 100).toFixed(2)}%` as `${number}%`
  return (
    <View style={[styles.strip, { backgroundColor: colors.borderMuted }]} pointerEvents="none">
      <View
        style={{
          height: '100%',
          width: widthPct,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
})

// ---------------------------------------------------------------------------
// Styles (dynamic, theme-aware)
// ---------------------------------------------------------------------------

function createStyles(
  colors: ReturnType<typeof createColors>,
  theme: 'light' | 'dark',
) {
  const isLight = theme === 'light'
  const borderColor = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.06)'
  const borderHover = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.14)'
  const shadow = isLight
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12 }

  return StyleSheet.create({
    cardParent: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor,
      padding: 14,
      marginBottom: 10,
      position: 'relative',
      overflow: 'hidden',
      ...shadow,
      elevation: isLight ? 1 : 5,
    },
    cardChild: {
      backgroundColor: isLight
        ? colors.surface
        : 'rgba(13, 11, 22, 0.6)',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)',
      padding: 12,
      marginBottom: 8,
      position: 'relative',
      overflow: 'hidden',
      elevation: isLight ? 0 : 2,
    },
    /** 1px top-edge highlight for glass/depth feel. Absolute overlay. */
    topHighlight: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.06)',
      opacity: 0.55,
      pointerEvents: 'none',
    },

    statusDue: {
      borderColor: borderHover,
    },
    statusOverdue: {
      borderColor: borderHover,
    },

    dimmed: { opacity: 0.4 },
    completed: { opacity: 0.55 },

    selected: {
      borderColor: colors.primary,
      borderWidth: 2,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },

    expandBtn: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    expandBtnOpen: {
      transform: [{ rotate: '90deg' }],
    },

    selectionBox: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 2,
    },
    selectionBoxEmpty: {
      borderColor: colors.borderEmphasis,
      backgroundColor: 'transparent',
    },
    selectionBoxFilled: {
      borderColor: 'transparent',
      backgroundColor: colors.primary,
    },

    body: {
      flex: 1,
      minWidth: 0,
    },

    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: -0.1,
    },
    titleDone: {
      textDecorationLine: 'line-through',
      textDecorationColor: colors.textMuted,
    },
    description: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },

    menuBtn: {
      padding: 6,
      borderRadius: 9999,
    },

    leftBar: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 3,
    },

    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
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
      marginVertical: 4,
      marginHorizontal: 8,
      backgroundColor: colors.borderMuted,
    },
  })
}
