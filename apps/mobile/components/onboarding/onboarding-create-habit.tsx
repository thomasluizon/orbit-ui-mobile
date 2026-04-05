import { useState, useCallback } from 'react'
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
import { useCreateHabit } from '@/hooks/use-habits'
import { getErrorMessage } from '@orbit/shared/utils'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { colors, radius, shadows } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  key: string
  frequency: FrequencyUnit
}

const suggestions: Suggestion[] = [
  { key: 'water', frequency: 'Day' },
  { key: 'read', frequency: 'Day' },
  { key: 'exercise', frequency: 'Week' },
  { key: 'meditate', frequency: 'Day' },
]

const frequencies: { value: FrequencyUnit | 'one-time'; labelKey: string }[] = [
  { value: 'Day', labelKey: 'onboarding.flow.createHabit.frequency.daily' },
  { value: 'Week', labelKey: 'onboarding.flow.createHabit.frequency.weekly' },
  { value: 'one-time', labelKey: 'onboarding.flow.createHabit.frequency.oneTime' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingCreateHabitProps {
  onCreated: (habitId: string, title: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingCreateHabit({ onCreated }: Readonly<OnboardingCreateHabitProps>) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [frequencyUnit, setFrequencyUnit] = useState<FrequencyUnit | undefined>('Day')
  const [isCreated, setIsCreated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)

  const createHabit = useCreateHabit()
  const isCreating = createHabit.isPending

  const activeFrequency = frequencyUnit ?? 'one-time'

  function selectSuggestion(suggestion: Suggestion) {
    setTitle(t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`))
    setFrequencyUnit(suggestion.frequency)
    setSelectedSuggestion(suggestion.key)
  }

  function selectFrequency(value: FrequencyUnit | 'one-time') {
    if (value === 'one-time') {
      setFrequencyUnit(undefined)
    } else {
      setFrequencyUnit(value)
    }
    setSelectedSuggestion(null)
  }

  const handleCreate = useCallback(() => {
    if (!title.trim() || isCreating) return

    setError(null)

    createHabit.mutate(
      {
        title: title.trim(),
        frequencyQuantity: 1,
        ...(frequencyUnit ? { frequencyUnit } : {}),
      },
      {
        onSuccess: (result) => {
          setIsCreated(true)
          setTimeout(() => {
            onCreated(result.id, title.trim())
          }, 1500)
        },
        onError: (err: unknown) => {
          setError(getErrorMessage(err, t('errors.createHabit')))
        },
      },
    )
  }, [title, frequencyUnit, isCreating, createHabit, onCreated, t])

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
          <Text style={styles.successTitle}>{title}</Text>
          <Text style={styles.successFreq}>
            {(() => {
              if (!frequencyUnit) return t('onboarding.flow.createHabit.frequency.oneTime')
              if (frequencyUnit === 'Day') return t('onboarding.flow.createHabit.frequency.daily')
              if (frequencyUnit === 'Week') return t('onboarding.flow.createHabit.frequency.weekly')
              return t('onboarding.flow.createHabit.frequency.oneTime')
            })()}
          </Text>
          <Text style={styles.successMessage}>
            {t('onboarding.flow.createHabit.success')}
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
      <Text style={styles.title}>{t('onboarding.flow.createHabit.title')}</Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.createHabit.subtitle')}
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
              {t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Title input */}
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('onboarding.flow.createHabit.placeholder')}
        placeholderTextColor={colors.textMuted}
        editable={!isCreating}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />

      {/* Frequency picker */}
      <View style={styles.freqRow}>
        {frequencies.map((freq) => (
          <TouchableOpacity
            key={freq.value}
            style={[
              styles.freqBtn,
              activeFrequency === freq.value && styles.freqBtnActive,
            ]}
            activeOpacity={0.8}
            disabled={isCreating}
            onPress={() => selectFrequency(freq.value)}
          >
            <Text
              style={[
                styles.freqBtnText,
                activeFrequency === freq.value && styles.freqBtnTextActive,
              ]}
            >
              {t(freq.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Create button */}
      <TouchableOpacity
        style={[
          styles.createBtn,
          !title.trim() && styles.createBtnDisabled,
        ]}
        activeOpacity={0.8}
        disabled={!title.trim() || isCreating}
        onPress={handleCreate}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.createBtnText}>
            {t('onboarding.flow.createHabit.create')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
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
  input: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
  },
  freqRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    width: '100%',
  },
  freqBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  freqBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadows.sm,
    elevation: 3,
  },
  freqBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  freqBtnTextActive: {
    color: colors.white,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    marginTop: 12,
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
  // Success state
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
  successFreq: {
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
