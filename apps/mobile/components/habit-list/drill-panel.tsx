import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface DrillPanelStyles {
  sectionInset: StyleProp<ViewStyle>
  drillAddBtn: StyleProp<ViewStyle>
  drillAddBtnText: StyleProp<TextStyle>
}

interface DrillHabitItemProps {
  child: NormalizedHabit
  styles: Pick<DrillPanelStyles, 'sectionInset'>
  getDrillChildren: (habitId: string) => NormalizedHabit[]
  renderHabitCard: (
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: { isDrillCard?: boolean },
  ) => ReactNode
}

/** A single sub-habit row inside the drill panel. Presentational — the parent
 *  HabitList owns drill state and supplies renderHabitCard. */
export function DrillHabitItem({
  child,
  styles,
  getDrillChildren,
  renderHabitCard,
}: DrillHabitItemProps) {
  const grandChildren = getDrillChildren(child.id)
  return (
    <View style={styles.sectionInset}>
      {renderHabitCard(
        child,
        0,
        grandChildren.length > 0,
        child.hasSubHabits || grandChildren.length > 0,
        { isDrillCard: true },
      )}
    </View>
  )
}

interface DrillFooterProps {
  styles: Pick<DrillPanelStyles, 'drillAddBtn' | 'drillAddBtnText'>
  label: string
  onAddSubHabit: () => void
}

/** Add-sub-habit affordance shown below the drill list. */
export function DrillFooter({ styles, label, onAddSubHabit }: DrillFooterProps) {
  return (
    <TouchableOpacity
      style={styles.drillAddBtn}
      onPress={onAddSubHabit}
      activeOpacity={0.7}
    >
      <Text style={styles.drillAddBtnText}>{label}</Text>
    </TouchableOpacity>
  )
}
