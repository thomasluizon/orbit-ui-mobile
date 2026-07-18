import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isCompletedOneTimeHabit } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { useHabits } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitPickerProps {
  selectedIds: string[]
  onToggle: (habitId: string) => void
}

/** Multi-select chip list of the user's top-level habits used to link contributions to a challenge. */
export function HabitPicker({ selectedIds, onToggle }: Readonly<HabitPickerProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { data } = useHabits({})
  const habits = (data?.topLevelHabits ?? []).filter(
    (habit) => !isCompletedOneTimeHabit(habit),
  )
  const selectedIdSet = new Set(selectedIds)

  if (habits.length === 0) {
    return (
      <Text style={{ fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 }}>
        {t('challenges.create.noHabits')}
      </Text>
    )
  }

  return (
    <View style={styles.wrap}>
      {habits.map((habit) => (
        <Chip
          key={habit.id}
          active={selectedIdSet.has(habit.id)}
          accessibilityLabel={habit.title}
          onPress={() => onToggle(habit.id)}
        >
          {habit.title}
        </Chip>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
