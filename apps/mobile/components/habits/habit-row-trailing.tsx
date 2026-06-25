import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from 'lucide-react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { createTokensV2 } from '@/lib/theme'
import { ParentRing } from '@/components/ui/parent-ring'
import type { StatusDotState } from '@/components/ui/status-dot'
import { CheckCircle } from './habit-row-check-circle'
import type { HabitRowActions } from './habit-row'
import { styles } from './habit-row-styles'

interface HabitRowTrailingProps {
  habit: NormalizedHabit
  isSelectMode: boolean
  hasChildren: boolean
  childrenDone: number
  childrenTotal: number
  linkedGoal: boolean
  isDoneForRange: boolean
  canLog: boolean
  dotState: StatusDotState
  hasMenuActions: boolean
  menuButtonRef: React.RefObject<View | null>
  actions: HabitRowActions
  tokens: ReturnType<typeof createTokensV2>
  onToggleStatus: () => void
  onOpenMenu: () => void
  onMenuActivity: () => void
}

export function HabitRowTrailing({
  habit,
  isSelectMode,
  hasChildren,
  childrenDone,
  childrenTotal,
  linkedGoal,
  isDoneForRange,
  canLog,
  dotState,
  hasMenuActions,
  menuButtonRef,
  actions,
  tokens,
  onToggleStatus,
  onOpenMenu,
  onMenuActivity,
}: Readonly<HabitRowTrailingProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.trailing}>
      {linkedGoal ? (
        <View
          style={[
            styles.linkedGoalDot,
            { backgroundColor: tokens.primary },
          ]}
        />
      ) : null}
      {!isSelectMode ? (
        hasChildren && childrenTotal > 0 ? (
          <>
            <Text style={[styles.childProgressText, { color: tokens.fg3 }]}>
              {childrenDone}/{childrenTotal}
            </Text>
            <Pressable
              onPress={() => {
                if (isDoneForRange) {
                  actions.onUnlog?.()
                } else if (childrenDone >= childrenTotal) {
                  actions.onLog?.()
                } else {
                  actions.onForceLogParent?.()
                }
              }}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel={`${habit.title} ${childrenDone}/${childrenTotal}`}
            >
              <ParentRing
                done={childrenDone}
                total={childrenTotal}
                size={30}
                color={habit.isBadHabit ? tokens.statusBad : undefined}
                trackColor={
                  habit.isBadHabit
                    ? `${tokens.statusBad}66`
                    : dotState === 'overdue'
                      ? `${tokens.statusOverdue}66`
                      : undefined
                }
              />
            </Pressable>
          </>
        ) : (
          <CheckCircle
            state={dotState}
            tone={habit.isBadHabit ? 'bad' : 'default'}
            onToggle={onToggleStatus}
            disabled={!canLog && !isDoneForRange}
            accessibilityLabel={`${t(
              `habits.statusDot.${dotState}` as const,
            )}, ${
              isDoneForRange
                ? t('habits.actions.unlog')
                : t('habits.logHabit')
            }`}
            tokens={tokens}
          />
        )
      ) : null}
      {!isSelectMode && hasMenuActions ? (
        <View ref={menuButtonRef} collapsable={false}>
          <Pressable
            onPressIn={onMenuActivity}
            onPress={onOpenMenu}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('habits.actions.more')}
            style={({ pressed }) => [
              styles.menuButton,
              pressed ? { backgroundColor: tokens.bgElevPressed } : null,
            ]}
          >
            <MoreVertical
              size={18}
              color={tokens.fg3}
              strokeWidth={1.8}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}
