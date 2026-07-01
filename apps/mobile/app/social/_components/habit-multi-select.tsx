import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react-native'
import { useHabits } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const MAX_HABITS = 10

interface HabitMultiSelectProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

/** Toggleable list of the user's top-level habits, capped at 1–10 for accountability pairing. */
export function HabitMultiSelect({ selectedIds, onChange }: Readonly<HabitMultiSelectProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { data } = useHabits({})
  const habits = data?.topLevelHabits ?? []

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((habitId) => habitId !== id))
      return
    }
    if (selectedIds.length >= MAX_HABITS) return
    onChange([...selectedIds, id])
  }

  if (habits.length === 0) {
    return <Text style={styles.empty}>{t('social.buddies.noHabits')}</Text>
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.hint}>{t('social.buddies.habitsHint')}</Text>
        <Text style={styles.hint}>{t('social.buddies.habitCount', { count: selectedIds.length })}</Text>
      </View>
      {habits.map((habit) => {
        const active = selectedIds.includes(habit.id)
        const disabled = !active && selectedIds.length >= MAX_HABITS
        return (
          <Pressable
            key={habit.id}
            onPress={() => toggle(habit.id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            style={[
              styles.row,
              {
                backgroundColor: active ? tokens.primarySoft : tokens.bgElev,
                borderColor: active ? tokens.primary : tokens.hairline,
                opacity: disabled ? 0.4 : 1,
              },
            ]}
          >
            <Text
              style={[styles.title, { color: active ? tokens.primary : tokens.fg1 }]}
              numberOfLines={1}
            >
              {habit.title}
            </Text>
            {active ? <Check size={18} color={tokens.primary} strokeWidth={2} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { gap: 8 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    hint: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    empty: { fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
    },
    title: { flex: 1, fontFamily: 'Rubik_400Regular', fontSize: 15 },
  })
}
