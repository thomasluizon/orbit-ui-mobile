import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateGoal } from '@/hooks/use-goals'
import {
  getFriendlyErrorMessage,
  ONBOARDING_GOAL_SUGGESTIONS,
  translateErrorKey,
  validateGoalDraftInput,
} from '@orbit/shared/utils'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoalSuggestion {
  key: string
  title: string
  target: number
  unit: string
}

interface OnboardingCreateGoalProps {
  onCreated: () => void
  onSkip: () => void
}

type AppColors = ReturnType<typeof useAppTheme>['colors']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingCreateGoal({
  onCreated,
  onSkip,
}: Readonly<OnboardingCreateGoalProps>) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState<number | undefined>(undefined)
  const [unit, setUnit] = useState('')
  const [isCreated, setIsCreated] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const { showError } = useAppToast()

  const createGoal = useCreateGoal()
  const isCreating = createGoal.isPending

  const suggestions = useMemo<GoalSuggestion[]>(
    () =>
      ONBOARDING_GOAL_SUGGESTIONS.map((suggestion) => ({
        key: suggestion.key,
        title: t(suggestion.titleKey),
        target: suggestion.target,
        unit: suggestion.unitKey ? t(suggestion.unitKey) : suggestion.unit,
      })),
    [t],
  )

  function selectSuggestion(suggestion: GoalSuggestion) {
    setDescription(suggestion.title)
    setTargetValue(suggestion.target)
    setUnit(suggestion.unit)
    setSelectedSuggestion(suggestion.key)
  }

  const canCreate = targetValue && targetValue > 0 && unit.trim()

  const handleCreate = useCallback(() => {
    if (!canCreate || isCreating) return

    const validationError = translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue ?? null, unit),
    )
    if (validationError) {
      showError(validationError)
      return
    }

    const title = description.trim() || `${targetValue} ${unit.trim()}`
    createGoal.mutate(
      {
        title,
        targetValue: targetValue ?? 0,
        unit: unit.trim(),
      },
      {
        onSuccess: () => {
          setIsCreated(true)
          setTimeout(() => {
            onCreated()
          }, 1500)
        },
        onError: (err: unknown) => {
          showError(getFriendlyErrorMessage(err, translate, 'goals.errors.create', 'goal'))
        },
      },
    )
  }, [canCreate, createGoal, description, isCreating, onCreated, showError, targetValue, translate, unit])

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (isCreated) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Check size={28} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>
            {targetValue} {unit}
          </Text>
          {description.trim() !== '' && (
            <Text style={styles.successDesc}>{description}</Text>
          )}
          <Text style={styles.successMessage}>
            {t('onboarding.flow.createGoal.success')}
          </Text>
        </View>
      </View>
    )
  }

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {t('onboarding.flow.createGoal.title')}
        </Text>
        <View style={styles.optionalBadge}>
          <Text style={styles.optionalText}>
            {t('onboarding.flow.createGoal.optional')}
          </Text>
        </View>
      </View>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.createGoal.subtitle')}
      </Text>

      {/* Suggestion chips */}
      <View style={styles.suggestionsRow}>
        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion.key}
            style={[
              styles.suggestionChip,
              selectedSuggestion === suggestion.key && styles.suggestionChipActive,
            ]}
            activeOpacity={0.7}
            onPress={() => selectSuggestion(suggestion)}
          >
            <Text
              style={[
                styles.suggestionText,
                selectedSuggestion === suggestion.key && styles.suggestionTextActive,
              ]}
            >
              {suggestion.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Form */}
      <View style={styles.formRow}>
        <TextInput
          style={[styles.input, styles.halfInput]}
          value={targetValue !== undefined ? String(targetValue) : ''}
          onChangeText={(text) => setTargetValue(text ? Number(text) : undefined)}
          placeholder={t('onboarding.flow.createGoal.targetPlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          editable={!isCreating}
        />
        <TextInput
          style={[styles.input, styles.halfInput]}
          value={unit}
          onChangeText={setUnit}
          placeholder={t('onboarding.flow.createGoal.unitPlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={50}
          editable={!isCreating}
        />
      </View>
      <TextInput
        style={[styles.input, styles.fullInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('onboarding.flow.createGoal.descriptionPlaceholder')}
        placeholderTextColor={colors.textMuted}
        maxLength={200}
        editable={!isCreating}
      />

      {/* Create button */}
      <TouchableOpacity
        style={[
          styles.createBtn,
          !canCreate && styles.createBtnDisabled,
        ]}
        activeOpacity={0.8}
        disabled={!canCreate || isCreating}
        onPress={handleCreate}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.createBtnText}>
            {t('onboarding.flow.createGoal.create')}
          </Text>
        )}
      </TouchableOpacity>

      {/* Skip button */}
      <TouchableOpacity
        style={styles.skipBtn}
        activeOpacity={0.7}
        disabled={isCreating}
        onPress={onSkip}
      >
        <Text style={styles.skipBtnText}>
          {t('onboarding.flow.createGoal.skipStep')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  optionalBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  optionalText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  suggestionChipActive: {
    backgroundColor: colors.primary_10,
    borderColor: colors.primary_30,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  suggestionTextActive: {
    color: colors.primary,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
  },
  halfInput: {
    flex: 1,
  },
  fullInput: {
    width: '100%',
  },
  createBtn: {
    width: '100%',
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    ...shadows.sm,
    elevation: 3,
  },
  createBtnDisabled: {
    backgroundColor: colors.primary_80,
    opacity: 0.5,
  },
  createBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  skipBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  // Success
  successCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(52, 211, 153, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  successDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  successMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.success,
    marginTop: 12,
  },
  })
}
