import { Pressable, Text, View } from 'react-native'
import { Plus, Trash2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { MAX_HABIT_TITLE_LENGTH, MAX_SUB_HABITS } from '@orbit/shared/validation'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ProBadge } from '@/components/ui/pro-badge'
import type { createTokensV2 } from '@/lib/theme'

export interface SubHabitEntry {
  id: string
  value: string
}

interface SubHabitEditorProps {
  subHabits: SubHabitEntry[]
  hasProAccess: boolean
  onUpdateSubHabit: (id: string, value: string) => void
  onRemoveSubHabit: (id: string) => void
  onAddSubHabit: () => void
  onUpgrade: () => void
  tokens: ReturnType<typeof createTokensV2>
  styles: {
    subHabitsSection: object
    subHabitsHeader: object
    subHabitsUpsellHeader: object
    subHabitsHeaderLeft: object
    fieldLabel: object
    subHabitsHint: object
    subHabitsUpgradeText: object
    subHabitsList: object
    subHabitRow: object
    subHabitIndex: object
    subHabitInput: object
    subHabitRemoveButton: object
    addSubHabitButton: object
    addSubHabitText: object
  }
}

export function SubHabitEditor({
  subHabits,
  hasProAccess,
  onUpdateSubHabit,
  onRemoveSubHabit,
  onAddSubHabit,
  onUpgrade,
  tokens,
  styles,
}: Readonly<SubHabitEditorProps>) {
  const { t } = useTranslation()

  if (!hasProAccess) {
    return (
      <View style={styles.subHabitsSection}>
        <View style={styles.subHabitsUpsellHeader}>
          <View style={styles.subHabitsHeaderLeft}>
            <View style={styles.subHabitsHeader}>
              <Text style={styles.fieldLabel}>{t('habits.form.subHabits')}</Text>
              <ProBadge alwaysVisible />
            </View>
            <Text style={styles.subHabitsHint}>
              {t('upgrade.features.subHabits.tooltip')}
            </Text>
          </View>
          <Pressable
            onPress={onUpgrade}
            hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
            style={({ pressed }) =>
              pressed ? { transform: [{ scale: 0.96 }] } : null
            }
            accessibilityRole="button"
            accessibilityLabel={t('upgrade.subscribe')}
          >
            <Text style={styles.subHabitsUpgradeText}>
              {t('upgrade.subscribe')}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.subHabitsSection}>
      <View style={styles.subHabitsHeader}>
        <Text style={styles.fieldLabel}>{t('habits.form.subHabits')}</Text>
      </View>
      {subHabits.length > 0 ? (
        <View style={styles.subHabitsList}>
          {subHabits.map((entry, index) => (
            <View key={entry.id} style={styles.subHabitRow}>
              <Text style={styles.subHabitIndex}>{index + 1}</Text>
              <BottomSheetAppTextInput
                value={entry.value}
                maxLength={MAX_HABIT_TITLE_LENGTH}
                placeholder={t('habits.form.subHabitPlaceholder')}
                placeholderTextColor={tokens.fg3}
                accessibilityLabel={t('habits.form.subHabitInputLabel', {
                  index: index + 1,
                })}
                style={styles.subHabitInput}
                onChangeText={(val: string) => onUpdateSubHabit(entry.id, val)}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.subHabitRemoveButton,
                  pressed && { transform: [{ scale: 0.96 }] },
                ]}
                onPress={() => onRemoveSubHabit(entry.id)}
                hitSlop={{
                  top: 6,
                  bottom: 6,
                  left: 6,
                  right: 6,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('habits.form.removeSubHabit')}
              >
                <Trash2 size={16} color={tokens.fg3} strokeWidth={1.8} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.addSubHabitButton,
          subHabits.length >= MAX_SUB_HABITS && { opacity: 0.45 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        hitSlop={{ top: 4, bottom: 4 }}
        disabled={subHabits.length >= MAX_SUB_HABITS}
        onPress={onAddSubHabit}
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.addSubHabit')}
      >
        <Plus size={14} color={tokens.fg2} strokeWidth={2} />
        <Text style={styles.addSubHabitText}>{t('habits.form.addSubHabit')}</Text>
      </Pressable>
    </View>
  )
}
