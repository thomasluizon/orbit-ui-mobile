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
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { frequencyUnitSchema } from '@orbit/shared/types/habit'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
  type BreakdownEditableHabit,
} from '@orbit/shared/utils'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'

type AppTokens = ReturnType<typeof createTokensV2>

interface EditableHabit extends BreakdownEditableHabit {
  id: string
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

function createEditableHabit(source?: SuggestedSubHabit): EditableHabit {
  return {
    id: createEditableHabitId(),
    title: source?.title ?? '',
    description: source?.description ?? '',
    frequencyUnit: source?.frequencyUnit ?? null,
    frequencyQuantity: source?.frequencyQuantity ?? null,
    days: source?.days ?? null,
    isBadHabit: source?.isBadHabit ?? false,
    dueDate: source?.dueDate ?? null,
    checklistItems: source?.checklistItems ?? null,
  }
}

const FREQUENCY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'habits.filter.oneTime' },
  { value: 'Day', labelKey: 'habits.filter.daily' },
  { value: 'Week', labelKey: 'habits.filter.weekly' },
  { value: 'Month', labelKey: 'habits.filter.monthly' },
  { value: 'Year', labelKey: 'habits.filter.yearly' },
]

type BreakdownStyles = ReturnType<typeof createStyles>

interface BreakdownHabitRowProps {
  habit: EditableHabit
  tokens: AppTokens
  styles: BreakdownStyles
  onUpdate: (patch: Partial<EditableHabit>) => void
  onRemove: () => void
}

function BreakdownHabitRow({
  habit,
  tokens,
  styles,
  onUpdate,
  onRemove,
}: Readonly<BreakdownHabitRowProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.habitRow}>
      <View style={styles.habitContent}>
        <AppTextInput
          style={styles.habitInput}
          value={habit.title}
          onChangeText={(text) => onUpdate({ title: text })}
          placeholder={t('habits.breakdown.habitNamePlaceholder')}
          placeholderTextColor={tokens.fg3}
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
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => {
                  const parsed = frequencyUnitSchema.safeParse(opt.value)
                  const val: FrequencyUnit | null = parsed.success ? parsed.data : null
                  onUpdate({
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
        {habit.frequencyUnit ? (
          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>{t('habits.breakdown.every')}</Text>
            <AppTextInput
              style={styles.quantityInput}
              value={String(habit.frequencyQuantity ?? 1)}
              onChangeText={(text) =>
                onUpdate({
                  frequencyQuantity: Number(text.replace(/[^0-9]/g, '')) || 1,
                })
              }
              keyboardType="number-pad"
              accessibilityLabel={t('habits.breakdown.frequencyQuantityLabel')}
            />
            <Text style={styles.quantityLabel}>
              {t(`habits.form.unit${habit.frequencyUnit}` as 'habits.form.unitDay')}
            </Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('habits.breakdown.removeHabit', {
          name: habit.title || t('habits.breakdown.habitNamePlaceholder'),
        })}
        onPress={onRemove}
      >
        <X size={14} color={tokens.fg3} />
      </TouchableOpacity>
    </View>
  )
}

interface BreakdownSuccessCardProps {
  tokens: AppTokens
  styles: BreakdownStyles
  parentName: string
  createdCount: number
  createAsParent: boolean
}

function BreakdownSuccessCard({
  tokens,
  styles,
  parentName,
  createdCount,
  createAsParent,
}: Readonly<BreakdownSuccessCardProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.card}>
      <View style={styles.successRow}>
        <View style={styles.successIcon}>
          <Check size={14} color={tokens.statusDone} />
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

interface BreakdownActionsProps {
  tokens: AppTokens
  styles: BreakdownStyles
  createAsParent: boolean
  createError: string
  validCount: number
  isSubmitting: boolean
  onAddHabit: () => void
  onToggleCreateAsParent: () => void
  onConfirm: () => void
  onCancel: () => void
}

function BreakdownActions({
  tokens,
  styles,
  createAsParent,
  createError,
  validCount,
  isSubmitting,
  onAddHabit,
  onToggleCreateAsParent,
  onConfirm,
  onCancel,
}: Readonly<BreakdownActionsProps>) {
  const { t } = useTranslation()
  return (
    <>
      <TouchableOpacity
        style={styles.addBtn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('habits.breakdown.addHabit')}
        onPress={onAddHabit}
      >
        <Plus size={14} color={tokens.primary} />
        <Text style={styles.addBtnText}>{t('habits.breakdown.addHabit')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.checkboxRow}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: createAsParent }}
        accessibilityLabel={t('habits.breakdown.createAsParent')}
        onPress={onToggleCreateAsParent}
      >
        <View
          style={[
            styles.checkbox,
            createAsParent && styles.checkboxActive,
          ]}
        >
          {createAsParent && <Check size={10} color={tokens.fgOnPrimary} />}
        </View>
        <Text style={styles.checkboxLabel}>
          {t('habits.breakdown.createAsParent')}
        </Text>
      </TouchableOpacity>

      {createError !== '' && (
        <Text style={styles.errorText}>{createError}</Text>
      )}

      <View style={styles.actions}>
        <PillButton
          style={styles.confirmPill}
          disabled={validCount === 0 || isSubmitting}
          onPress={onConfirm}
          leading={
            isSubmitting ? <ActivityIndicator size="small" color={tokens.fgOnPrimary} /> : undefined
          }
        >
          <Text style={styles.confirmPillLabel}>
            {plural(t('habits.breakdown.createCount', { n: validCount }), validCount)}
          </Text>
        </PillButton>
        <PillButton
          variant="ghost"
          style={styles.cancelPill}
          disabled={isSubmitting}
          onPress={onCancel}
        >
          <Text style={styles.cancelPillLabel}>{t('common.cancel')}</Text>
        </PillButton>
      </View>
    </>
  )
}

export function BreakdownSuggestion({
  parentName,
  subHabits,
  onConfirmed,
  onCancelled,
}: Readonly<BreakdownSuggestionProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const bulkCreate = useBulkCreateHabits()
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const [habits, setHabits] = useState<EditableHabit[]>(
    subHabits.map((h) => createEditableHabit(h)),
  )

  const [isCreated, setIsCreated] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const [createAsParent, setCreateAsParent] = useState(false)
  const [createError, setCreateError] = useState('')

  const validHabits = useMemo(
    () => filterValidBreakdownHabits(habits),
    [habits],
  )

  function updateHabit(index: number, patch: Partial<EditableHabit>) {
    setHabits((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  function removeHabit(index: number) {
    setHabits((prev) => prev.filter((_, i) => i !== index))
  }

  function addHabit() {
    setHabits((prev) => [...prev, createEditableHabit()])
  }

  async function handleConfirm() {
    if (validHabits.length === 0) return
    setCreateError('')

    try {
      await bulkCreate.mutateAsync(
        buildBreakdownCreateRequest(validHabits, parentName, createAsParent),
      )
      setCreatedCount(validHabits.length)
      setIsCreated(true)
      onConfirmed()
    } catch (err: unknown) {
      setCreateError(
        process.env.NODE_ENV === 'development' && err instanceof Error
          ? err.message
          : t('errors.bulkCreateHabits'),
      )
    }
  }

  const isSubmitting = bulkCreate.isPending

  if (isCreated) {
    return (
      <BreakdownSuccessCard
        tokens={tokens}
        styles={styles}
        parentName={parentName}
        createdCount={createdCount}
        createAsParent={createAsParent}
      />
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.headerText}>
        {t('habits.breakdown.breakInto', { name: parentName })}
      </Text>

      <View style={styles.habitsList}>
        {habits.map((habit, index) => (
          <BreakdownHabitRow
            key={habit.id}
            habit={habit}
            tokens={tokens}
            styles={styles}
            onUpdate={(patch) => updateHabit(index, patch)}
            onRemove={() => removeHabit(index)}
          />
        ))}
      </View>

      <BreakdownActions
        tokens={tokens}
        styles={styles}
        createAsParent={createAsParent}
        createError={createError}
        validCount={validHabits.length}
        isSubmitting={isSubmitting}
        onAddHabit={addHabit}
        onToggleCreateAsParent={() => setCreateAsParent((prev) => !prev)}
        onConfirm={() => {
          void handleConfirm()
        }}
        onCancel={onCancelled}
      />
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
  card: {
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.hairline,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  headerText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fg1,
  },
  habitsList: {
    gap: 12,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgElev,
    borderWidth: 1,
    borderColor: tokens.hairline,
    borderRadius: 12,
    padding: 12,
  },
  habitContent: {
    flex: 1,
    gap: 6,
  },
  habitInput: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fg1,
    minHeight: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  freqChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tokens.hairline,
  },
  freqChipActive: {
    backgroundColor: tintFromPrimary(tokens, 0.1),
    borderColor: tintFromPrimary(tokens, 0.3),
  },
  freqChipText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    color: tokens.fg2,
  },
  freqChipTextActive: {
    fontFamily: 'Rubik_500Medium',
    color: tokens.primary,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quantityLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    color: tokens.fg3,
  },
  quantityInput: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 11,
    color: tokens.fg2,
    textAlign: 'center',
    minWidth: 32,
    minHeight: 0,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: tokens.bgField,
    borderRadius: 6,
  },
  removeBtn: {
    padding: 6,
    borderRadius: 999,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addBtnText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 12,
    color: tokens.primary,
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
    borderColor: tokens.fg4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: tokens.primary,
    borderColor: tokens.primary,
  },
  checkboxLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: tokens.fg2,
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: tokens.statusBad,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  confirmPill: {
    flex: 1,
    paddingVertical: 11,
  },
  confirmPillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fgOnPrimary,
  },
  cancelPill: {
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  cancelPillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fg1,
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
    backgroundColor: `${tokens.statusDone}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.statusDone,
  },
  })
}
