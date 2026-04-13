import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateHabit } from '@/hooks/use-habits'
import { AppTextInput } from '@/components/ui/app-text-input'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
  validateHabitFormInput,
} from '@orbit/shared/utils'
import {
  getOnboardingHabitFrequencyLabelKey,
  ONBOARDING_HABIT_FREQUENCIES,
  ONBOARDING_HABIT_SUGGESTIONS,
  type OnboardingFrequencyUnit,
} from '@orbit/shared/utils/onboarding'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  key: string
  frequency: OnboardingFrequencyUnit
}

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
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [title, setTitle] = useState('')
  const [frequencyUnit, setFrequencyUnit] = useState<OnboardingFrequencyUnit | undefined>('Day')
  const [isCreated, setIsCreated] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const { showError } = useAppToast()

  const createHabit = useCreateHabit()
  const isCreating = createHabit.isPending

  const activeFrequency = frequencyUnit ?? 'one-time'

  function selectSuggestion(suggestion: Suggestion) {
    setTitle(t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`))
    setFrequencyUnit(suggestion.frequency)
    setSelectedSuggestion(suggestion.key)
  }

  function selectFrequency(value: OnboardingFrequencyUnit | 'one-time') {
    if (value === 'one-time') {
      setFrequencyUnit(undefined)
    } else {
      setFrequencyUnit(value)
    }
    setSelectedSuggestion(null)
  }

  const handleCreate = useCallback(() => {
    if (!title.trim() || isCreating) return

    const validationError = translateErrorKey(
      translate,
      validateHabitFormInput({
        title: title.trim(),
        frequencyUnit,
        frequencyQuantity: frequencyUnit ? 1 : null,
      }),
    )
    if (validationError) {
      showError(validationError)
      return
    }

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
          showError(getFriendlyErrorMessage(err, translate, 'errors.createHabit', 'habit'))
        },
      },
    )
  }, [title, frequencyUnit, isCreating, createHabit, onCreated, showError, translate])

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
              return t(getOnboardingHabitFrequencyLabelKey(frequencyUnit))
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
        {ONBOARDING_HABIT_SUGGESTIONS.map((suggestion) => (
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
      <AppTextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('onboarding.flow.createHabit.placeholder')}
        placeholderTextColor={colors.textMuted}
        maxLength={200}
        editable={!isCreating}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />

      {/* Frequency picker */}
      <View style={styles.freqRow}>
        {ONBOARDING_HABIT_FREQUENCIES.map((freq) => (
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

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
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
}
