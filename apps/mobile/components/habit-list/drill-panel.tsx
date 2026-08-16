import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import type { ReactNode } from 'react'
import { Plus } from '@/components/ui/icons'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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
}: Readonly<DrillHabitItemProps>) {
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
export function DrillFooter({ styles, label, onAddSubHabit }: Readonly<DrillFooterProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      style={({ pressed }) => [
        styles.drillAddBtn,
        pressed ? { transform: [{ scale: 0.96 }] } : null,
      ]}
      onPress={onAddSubHabit}
      accessibilityRole="button"
    >
      <Plus size={16} color={tokens.fg3} strokeWidth={1.8} />
      <Text style={styles.drillAddBtnText}>{label}</Text>
    </Pressable>
  )
}
