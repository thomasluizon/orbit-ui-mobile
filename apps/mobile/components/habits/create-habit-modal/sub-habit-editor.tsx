import { Text, TouchableOpacity, View } from 'react-native'
import { Plus, Trash2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
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
  tokens: ReturnType<typeof createTokensV2>
  styles: {
    subHabitsSection: object
    subHabitsHeader: object
    fieldLabel: object
    subHabitsHint: object
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
  tokens,
  styles,
}: Readonly<SubHabitEditorProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.subHabitsSection}>
      <View style={styles.subHabitsHeader}>
        <Text style={styles.fieldLabel}>{t('habits.form.subHabits')}</Text>
        {!hasProAccess ? <ProBadge alwaysVisible /> : null}
      </View>
      {!hasProAccess ? (
        <Text style={styles.subHabitsHint}>
          {t('upgrade.comparison.subHabits.tooltip')}
        </Text>
      ) : null}
      {subHabits.length > 0 ? (
        <View style={styles.subHabitsList}>
          {subHabits.map((entry, index) => (
            <View key={entry.id} style={styles.subHabitRow}>
              <Text style={styles.subHabitIndex}>{index + 1}</Text>
              <BottomSheetAppTextInput
                value={entry.value}
                maxLength={200}
                placeholder={t('habits.form.subHabitPlaceholder')}
                placeholderTextColor={tokens.fg4}
                style={styles.subHabitInput}
                onChangeText={(val: string) => onUpdateSubHabit(entry.id, val)}
              />
              <TouchableOpacity
                style={styles.subHabitRemoveButton}
                onPress={() => onRemoveSubHabit(entry.id)}
                activeOpacity={0.7}
                hitSlop={{
                  top: 6,
                  bottom: 6,
                  left: 6,
                  right: 6,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
              >
                <Trash2 size={16} color={tokens.fg4} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.addSubHabitButton}
        disabled={subHabits.length >= 20}
        onPress={onAddSubHabit}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.addSubHabit')}
      >
        <Plus size={16} color={tokens.fg3} strokeWidth={1.8} />
        <Text style={styles.addSubHabitText}>{t('habits.form.addSubHabit')}</Text>
      </TouchableOpacity>
    </View>
  )
}
