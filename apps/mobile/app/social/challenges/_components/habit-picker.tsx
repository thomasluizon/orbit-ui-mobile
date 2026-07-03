import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useHabits } from '@/hooks/use-habits'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
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
  const habits = data?.topLevelHabits ?? []

  if (habits.length === 0) {
    return (
      <Text style={{ fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 }}>
        {t('challenges.create.noHabits')}
      </Text>
    )
  }

  return (
    <View style={styles.wrap}>
      {habits.map((habit) => {
        const active = selectedIds.includes(habit.id)
        return (
          <Pressable
            key={habit.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={habit.title}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => onToggle(habit.id)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? tintFromPrimary(tokens, 0.12) : tokens.bgElev,
                borderColor: active ? tokens.primary : tokens.hairline,
              },
              pressed ? styles.chipPressed : null,
            ]}
          >
            <Text style={[styles.chipText, { color: active ? tokens.primary : tokens.fg2 }]}>
              {habit.title}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipPressed: { transform: [{ scale: 0.96 }] },
  chipText: { fontFamily: 'Rubik_400Regular', fontSize: 14 },
})
