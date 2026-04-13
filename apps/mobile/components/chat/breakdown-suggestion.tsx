import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Check, X, Plus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import type { BulkHabitItem, FrequencyUnit } from '@orbit/shared/types/habit'
import { frequencyUnitSchema } from '@orbit/shared/types/habit'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { AppTextInput } from '@/components/ui/app-text-input'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditableHabit {
  id: string
  title: string
  description: string
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  days: string[] | null
  isBadHabit: boolean
  dueDate: string | null
  checklistItems: { text: string; isChecked: boolean }[] | null
}

interface BreakdownSuggestionProps {
  parentName: string
  subHabits: SuggestedSubHabit[]
  onConfirmed: () => void
  onCancelled: () => void
}

function createEditableHabitId() {
  return `editable-habit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Frequency options
// ---------------------------------------------------------------------------

const FREQUENCY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'habits.filter.oneTime' },
  { value: 'Day', labelKey: 'habits.filter.daily' },
  { value: 'Week', labelKey: 'habits.filter.weekly' },
  { value: 'Month', labelKey: 'habits.filter.monthly' },
  { value: 'Year', labelKey: 'habits.filter.yearly' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BreakdownSuggestion({
  parentName,
  subHabits,
  onConfirmed,
  onCancelled,
}: Readonly<BreakdownSuggestionProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const bulkCreate = useBulkCreateHabits()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [habits, setHabits] = useState<EditableHabit[]>(
    subHabits.map((h) => ({
      id: createEditableHabitId(),
      title: h.title,
      description: h.description ?? '',
      frequencyUnit: h.frequencyUnit ?? null,
      frequencyQuantity: h.frequencyQuantity ?? null,
      days: h.days ?? null,
      isBadHabit: h.isBadHabit ?? false,
      dueDate: h.dueDate ?? null,
      checklistItems: h.checklistItems ?? null,
    })),
  )

  const [isCreated, setIsCreated] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const [createAsParent, setCreateAsParent] = useState(false)
  const [createError, setCreateError] = useState('')

  const validHabits = useMemo(
    () => habits.filter((h) => h.title.trim().length > 0),
    [habits],
  )

  function updateHabit(index: number, patch: Partial<EditableHabit>) {
    setHabits((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  function removeHabit(index: number) {
    setHabits((prev) => prev.filter((_, i) => i !== index))
  }

  function addHabit() {
    setHabits((prev) => [
      ...prev,
      {
        id: createEditableHabitId(),
        title: '',
        description: '',
        frequencyUnit: null,
        frequencyQuantity: null,
        days: null,
        isBadHabit: false,
        dueDate: null,
        checklistItems: null,
      },
    ])
  }

  function resolveFrequencyQuantity(habit: EditableHabit): number | undefined {
    if (!habit.frequencyUnit) return undefined
    return habit.frequencyQuantity && habit.frequencyQuantity >= 1
      ? habit.frequencyQuantity
      : 1
  }

  async function handleConfirm() {
    if (validHabits.length === 0) return
    setCreateError('')

    try {
      const subItems: BulkHabitItem[] = validHabits.map((h) => ({
        title: h.title.trim(),
        description: h.description.trim() || undefined,
        frequencyUnit: h.frequencyUnit ?? undefined,
        frequencyQuantity: resolveFrequencyQuantity(h),
        days: h.days ?? undefined,
        isBadHabit: h.isBadHabit,
        dueDate: h.dueDate ?? undefined,
        checklistItems: h.checklistItems ?? undefined,
      }))

      if (createAsParent) {
        const firstWithFreq = validHabits.find((h) => h.frequencyUnit)
        const earliestDueDate =
          validHabits
            .map((h) => h.dueDate)
            .filter((d): d is string => !!d)
            .sort((a, b) => a.localeCompare(b))[0] ?? new Date().toISOString().slice(0, 10)

        let parentFreqQty: number | undefined
        if (firstWithFreq?.frequencyUnit) {
          parentFreqQty = resolveFrequencyQuantity(firstWithFreq)
        }

        await bulkCreate.mutateAsync({
          habits: [
            {
              title: parentName,
              frequencyUnit: firstWithFreq?.frequencyUnit ?? undefined,
              frequencyQuantity: parentFreqQty,
              dueDate: earliestDueDate,
              subHabits: subItems,
            },
          ],
        })
        setCreatedCount(subItems.length)
      } else {
        await bulkCreate.mutateAsync({ habits: subItems })
        setCreatedCount(subItems.length)
      }

      setIsCreated(true)
      onConfirmed()
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : t('errors.bulkCreateHabits'),
      )
    }
  }

  const isSubmitting = bulkCreate.isPending

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (isCreated) {
    return (
      <View style={styles.card}>
        <View style={styles.successRow}>
          <View style={styles.successIcon}>
            <Check size={14} color={colors.emerald400} />
          </View>
          <Text style={styles.successText}>
            {createAsParent
              ? plural(
                  t('habits.breakdown.createAsParentSuccess', {
                    name: parentName,
                    n: createdCount,
                  }),
                  createdCount,
                )
              : plural(t('habits.breakdown.createdSuccess', { n: createdCount }), createdCount)}
          </Text>
        </View>
      </View>
    )
  }

  // ---------------------------------------------------------------------------
  // Editable state
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.card}>
      <Text style={styles.headerText}>
        {t('habits.breakdown.breakInto', { name: parentName })}
      </Text>

      {/* Habit list */}
      <View style={styles.habitsList}>
        {habits.map((habit, index) => (
          <View key={habit.id} style={styles.habitRow}>
            <View style={styles.habitContent}>
              <AppTextInput
                style={styles.habitInput}
                value={habit.title}
                onChangeText={(text) => updateHabit(index, { title: text })}
                placeholder={t('habits.breakdown.habitNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.freqRow}>
                {FREQUENCY_OPTIONS.map((opt) => {
                  const isActive =
                    opt.value === '' ? !habit.frequencyUnit : habit.frequencyUnit === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.freqChip,
                        isActive && styles.freqChipActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        const parsed = frequencyUnitSchema.safeParse(opt.value)
                        const val: FrequencyUnit | null = parsed.success ? parsed.data : null
                        updateHabit(index, {
                          frequencyUnit: val,
                          frequencyQuantity: val ? habit.frequencyQuantity : null,
                        })
                      }}
                    >
                      <Text
                        style={[
                          styles.freqChipText,
                          isActive && styles.freqChipTextActive,
                        ]}
                      >
                        {t(opt.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              activeOpacity={0.7}
              onPress={() => removeHabit(index)}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Add habit */}
      <TouchableOpacity
        style={styles.addBtn}
        activeOpacity={0.7}
        onPress={addHabit}
      >
        <Plus size={14} color={colors.primary} />
        <Text style={styles.addBtnText}>{t('habits.breakdown.addHabit')}</Text>
      </TouchableOpacity>

      {/* Group as parent checkbox */}
      <TouchableOpacity
        style={styles.checkboxRow}
        activeOpacity={0.7}
        onPress={() => setCreateAsParent((prev) => !prev)}
      >
        <View
          style={[
            styles.checkbox,
            createAsParent && styles.checkboxActive,
          ]}
        >
          {createAsParent && <Check size={10} color={colors.white} />}
        </View>
        <Text style={styles.checkboxLabel}>
          {t('habits.breakdown.createAsParent')}
        </Text>
      </TouchableOpacity>

      {/* Error */}
      {createError !== '' && (
        <Text style={styles.errorText}>{createError}</Text>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (validHabits.length === 0 || isSubmitting) && styles.btnDisabled,
          ]}
          activeOpacity={0.8}
          disabled={validHabits.length === 0 || isSubmitting}
          onPress={handleConfirm}
        >
          {isSubmitting && <ActivityIndicator size="small" color={colors.white} />}
          <Text style={styles.confirmBtnText}>
            {plural(t('habits.breakdown.createCount', { n: validHabits.length }), validHabits.length)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelBtn}
          activeOpacity={0.7}
          disabled={isSubmitting}
          onPress={onCancelled}
        >
          <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.xl,
    padding: 16,
    gap: 12,
    ...shadows.sm,
    elevation: 2,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  habitsList: {
    gap: 12,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    padding: 12,
  },
  habitContent: {
    flex: 1,
    gap: 6,
  },
  habitInput: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    padding: 0,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  freqChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  freqChipActive: {
    backgroundColor: colors.primary_20,
    borderColor: colors.primary_30,
  },
  freqChipText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  freqChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  removeBtn: {
    padding: 6,
    borderRadius: radius.full,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 12,
    color: colors.red400,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  confirmBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  successIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.emerald500_20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.emerald400,
  },
  })
}
