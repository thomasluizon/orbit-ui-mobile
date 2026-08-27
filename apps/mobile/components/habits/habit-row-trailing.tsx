import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from '@/components/ui/icons'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import { MenuAnchorHost } from '@/components/ui/anchored-menu'
import { ParentRing } from '@/components/ui/parent-ring'
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
}

function resolveLogAction(
  childrenDone: number,
  childrenTotal: number,
  actions: HabitRowActions,
): (() => void) | undefined {
  return childrenDone >= childrenTotal ? actions.onLog : actions.onForceLogParent
}

function resolveParentRingTrackColor(
  habit: NormalizedHabit,
  dotState: HabitStatus,
  tokens: ReturnType<typeof createTokensV2>,
) {
  if (habit.isBadHabit) return `${tokens.statusBad}66`
  if (dotState === 'overdue') return `${tokens.statusOverdue}66`
  return undefined
}

function resolveParentRingColor(
  isBadHabit: boolean,
  tokens: ReturnType<typeof createTokensV2>,
) {
  return isBadHabit ? tokens.statusBad : undefined
}

// react-doctor-disable-next-line no-many-boolean-props -- private row-internal cluster; the flags are independent render inputs from the parent row, not a combinatorial public API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitRowTrailing({
  habit,
  depth,
  isSelectMode,
  hasChildren,
  childrenDone,
  childrenTotal,
  isDoneForRange,
  canLog,
  dotState,
  hasMenuActions,
  menuButtonRef,
  actions,
  tokens,
  onToggleStatus,
  onOpenMenu,
}: Readonly<HabitRowTrailingProps>) {
  const { t } = useTranslation()
  const statusLabel = t(`habits.statusDot.${dotState}` as const)
  const toggleLabel = isDoneForRange
    ? t('habits.actions.unlog')
    : t('habits.logHabit')
  return (
    <View style={styles.trailing}>
      {!isSelectMode &&
        (hasChildren && childrenTotal > 0 ? (
          <>
            <Pressable
              onPress={() => {
                const parentAction = isDoneForRange
                  ? actions.onUnlog
                  : resolveLogAction(childrenDone, childrenTotal, actions)
                parentAction?.()
              }}
              accessibilityRole="button"
              accessibilityLabel={`${statusLabel}, ${toggleLabel}: ${habit.title}, ${childrenDone}/${childrenTotal}`}
              style={styles.parentRingButton}
            >
              <ParentRing
                done={childrenDone}
                total={childrenTotal}
                size={depth === 1 ? 24 : 30}
                color={resolveParentRingColor(habit.isBadHabit, tokens)}
                trackColor={resolveParentRingTrackColor(habit, dotState, tokens)}
              />
            </Pressable>
          </>
        ) : (
          <CheckCircle
            state={dotState}
            onToggle={onToggleStatus}
            disabled={!canLog && !isDoneForRange}
            accessibilityLabel={`${statusLabel}, ${toggleLabel}: ${habit.title}`}
            tokens={tokens}
            size={depth === 1 ? 24 : 30}
          />
        ))}
      {!isSelectMode && hasMenuActions ? (
        <MenuAnchorHost anchorRef={menuButtonRef}>
          <Pressable
            onPress={onOpenMenu}
            accessibilityRole="button"
            accessibilityLabel={t('habits.actions.more')}
            style={({ pressed }) => [
              styles.menuButton,
              pressed
                ? {
                    backgroundColor: tokens.bgElevPressed,
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
