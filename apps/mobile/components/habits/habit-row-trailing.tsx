import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from '@/components/ui/icons'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import { MenuAnchorHost } from '@/components/ui/menu'
import { ParentRing } from '@/components/ui/parent-ring'
import { StatusRing } from '@/components/ui/status-ring'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { CheckCircle } from './habit-row-check-circle'
import type { HabitRowActions } from './habit-row'
import { styles } from './habit-row-styles'

interface HabitRowTrailingProps {
  habit: NormalizedHabit
  depth: 0 | 1
  isSelectMode: boolean
  hasChildren: boolean
  childrenDone: number
  childrenTotal: number
  isDoneForRange: boolean
  canLog: boolean
  dotState: HabitStatus
  hasMenuActions: boolean
  menuButtonRef: React.RefObject<View | null>
  actions: HabitRowActions
  tokens: ReturnType<typeof createTokensV2>
  onToggleStatus: () => void
  onOpenMenu: () => void
  menuVisible: boolean
  completionReadOnly: boolean
  completionReason?: string
  completionStatusUnavailable: boolean
}

function resolveParentRingColors(
  habit: NormalizedHabit,
  dotState: HabitStatus,
  tokens: ReturnType<typeof createTokensV2>,
) {
  if (habit.isBadHabit) {
    return { stroke: tokens.statusBad, trackColor: `${tokens.statusBad}66` }
  }
  return {
    stroke: undefined,
    trackColor: dotState === 'overdue' ? `${tokens.statusOverdue}66` : undefined,
  }
}

function completionRingLabel(unavailable: boolean, status: string, action: string, title: string): string {
  return unavailable ? `${action}: ${title}` : `${status}, ${action}: ${title}`
}

function showParentRing(hasChildren: boolean, childrenTotal: number, unavailable: boolean): boolean {
  return hasChildren && childrenTotal > 0 && !unavailable
}

function SelectionStatusGlyph({
  habit, depth, hasChildren, childrenDone, childrenTotal, dotState, tokens,
  completionReadOnly, completionStatusUnavailable,
}: Readonly<HabitRowTrailingProps>) {
  const { t } = useTranslation()
  const statusName = t(`habits.statusDot.${dotState}` as const)
  if (showParentRing(hasChildren, childrenTotal, completionStatusUnavailable)) {
    return (
      <View accessibilityRole="image" accessibilityLabel={`${statusName}, ${childrenDone}/${childrenTotal}`}
        style={[styles.parentRingButton, completionReadOnly ? { opacity: 0.4 } : null]}>
        <ParentRing done={childrenDone} total={childrenTotal} size={depth === 1 ? 24 : 30}
          {...resolveParentRingColors(habit, dotState, tokens)} />
      </View>
    )
  }
  return (
    <View style={[styles.parentRingButton, completionReadOnly ? { opacity: 0.4 } : null]}>
      <StatusRing status={dotState} size={depth === 1 ? 24 : 30} label={statusName} />
    </View>
  )
}

function InteractiveParentRing({
  habit, depth, childrenDone, childrenTotal, isDoneForRange, dotState, actions, tokens,
  completionReadOnly, completionReason, completionStatusUnavailable,
}: Readonly<HabitRowTrailingProps>) {
  const { t } = useTranslation()
  const statusName = t(`habits.statusDot.${dotState}` as const)
  const toggleLabel = isDoneForRange ? t('habits.actions.unlog') : t('habits.logHabit')
  const completionLabel = completionRingLabel(completionStatusUnavailable, statusName, toggleLabel, habit.title)
  return (
    <Pressable onPress={() => {
      if (completionReadOnly) return
      const parentAction = isDoneForRange ? actions.onUnlog : actions.onLog
      parentAction?.()
    }} accessibilityRole="button" disabled={completionReadOnly}
      accessibilityState={{ disabled: completionReadOnly }}
      accessibilityHint={completionReadOnly ? completionReason : undefined}
      accessibilityLabel={`${completionLabel}, ${childrenDone}/${childrenTotal}`}
      style={({ pressed }) => [
        styles.parentRingButton,
        completionReadOnly ? { opacity: 0.4 } : null,
        pressed && !completionReadOnly
          ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null,
      ]}>
      <ParentRing done={childrenDone} total={childrenTotal} size={depth === 1 ? 24 : 30}
        {...resolveParentRingColors(habit, dotState, tokens)} />
    </Pressable>
  )
}

function HabitRowCompletion(props: Readonly<HabitRowTrailingProps>) {
  const { t } = useTranslation()
  if (props.isSelectMode) return <SelectionStatusGlyph {...props} />
  if (showParentRing(props.hasChildren, props.childrenTotal, props.completionStatusUnavailable)) {
    return <InteractiveParentRing {...props} />
  }
  const statusName = t(`habits.statusDot.${props.dotState}` as const)
  const toggleLabel = props.isDoneForRange ? t('habits.actions.unlog') : t('habits.logHabit')
  const completionLabel = completionRingLabel(props.completionStatusUnavailable, statusName, toggleLabel, props.habit.title)
  return <CheckCircle state={props.dotState} unavailable={props.completionStatusUnavailable}
    onToggle={props.onToggleStatus}
    disabled={props.completionReadOnly || (!props.canLog && !props.isDoneForRange)}
    accessibilityLabel={completionLabel}
    accessibilityHint={props.completionReadOnly ? props.completionReason : undefined}
    tokens={props.tokens} size={props.depth === 1 ? 24 : 30} />
}

// react-doctor-disable-next-line no-many-boolean-props -- private row-internal cluster; the flags are independent render inputs from the parent row, not a combinatorial public API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitRowTrailing(props: Readonly<HabitRowTrailingProps>) {
  const {
  isSelectMode,
  hasMenuActions,
  menuButtonRef,
  tokens,
  onOpenMenu,
  menuVisible,
  } = props
  const { t } = useTranslation()
  return (
    <View style={styles.trailing}>
      <HabitRowCompletion {...props} />
      {!isSelectMode && hasMenuActions ? (
        <MenuAnchorHost anchorRef={menuButtonRef}>
          <Pressable
            onPress={onOpenMenu}
            accessibilityRole="button"
            accessibilityLabel={t('habits.actions.more')}
            accessibilityState={{ expanded: menuVisible }}
            style={({ pressed }) => [
              styles.menuButton,
              pressed
                ? {
                    backgroundColor: tokens.bgHover,
                    transform: [{ scale: 0.96 }],
                  }
                : null,
            ]}
          >
            <MoreVertical
              size={20}
              color={tokens.fg3}
              strokeWidth={1.8}
            />
          </Pressable>
        </MenuAnchorHost>
      ) : null}
    </View>
  )
}
