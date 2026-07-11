import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { Check, Plus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import {
  buildBreakdownCreateRequest,
  createClientId,
  filterValidBreakdownHabits,
} from '@orbit/shared/utils'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'
import {
  BreakdownHabitRow,
  type EditableHabit,
} from './breakdown-habit-row'
import {
  createStyles,
  type AppTokens,
  type BreakdownStyles,
} from './breakdown-suggestion.styles'

interface BreakdownSuggestionProps {
  parentName: string
  subHabits: SuggestedSubHabit[]
  onConfirmed: () => void
  onCancelled: () => void
}

function createEditableHabitId() {
  return createClientId('editable-habit')
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
      <Pressable
        style={({ pressed }) => [styles.addBtn, pressed && styles.controlPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('habits.breakdown.addHabit')}
        onPress={onAddHabit}
      >
        <Plus size={14} color={tokens.primary} />
        <Text style={styles.addBtnText}>{t('habits.breakdown.addHabit')}</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.checkboxRow, pressed && styles.controlPressed]}
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
      </Pressable>

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
