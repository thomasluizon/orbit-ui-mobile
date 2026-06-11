import { useState, useMemo, useCallback } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateHabit } from '@/hooks/use-habits'
import { FieldInput } from '@/components/ui/field-input'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
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
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface Suggestion {
  key: string
  frequency: OnboardingFrequencyUnit
}

interface OnboardingCreateHabitProps {
  onCreated: (habitId: string, title: string) => void
}

/**
 * ob-3 step: "Tell Astra what to track." Kit field well, suggestion chips,
 * frequency chip row, pill CTA.
 */
export function OnboardingCreateHabit({
  onCreated,
}: Readonly<OnboardingCreateHabitProps>) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [title, setTitle] = useState('')
  const [frequencyUnit, setFrequencyUnit] = useState<
    OnboardingFrequencyUnit | undefined
  >('Day')
  const [isCreated, setIsCreated] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  )
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
          showError(
            getFriendlyErrorMessage(err, translate, 'errors.createHabit', 'habit'),
          )
        },
      },
    )
  }, [
    title,
    frequencyUnit,
    isCreating,
    createHabit,
    onCreated,
    showError,
    translate,
  ])

  if (isCreated) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Check size={26} color={tokens.fgOnPrimary} strokeWidth={2.4} />
          </View>
          <Text style={styles.successTitle}>{title}</Text>
          <Text style={styles.successFreq}>
            {t(getOnboardingHabitFrequencyLabelKey(frequencyUnit))}
          </Text>
          <Text style={styles.successMessage}>
            {t('onboarding.flow.createHabit.success')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('onboarding.flow.createHabit.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.createHabit.subtitle')}
      </Text>

      <FieldInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('onboarding.flow.createHabit.placeholder')}
        maxLength={200}
        editable={!isCreating}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />

      <View style={styles.chipsRow}>
        {ONBOARDING_HABIT_FREQUENCIES.map((freq) => (
          <Chip
            key={freq.value}
            active={activeFrequency === freq.value}
            onPress={() => selectFrequency(freq.value)}
          >
            {t(freq.labelKey)}
          </Chip>
        ))}
      </View>

      <Text style={styles.sectionLabel}>
        {t('onboarding.flow.createHabit.starters')}
      </Text>
      <View style={styles.chipsRow}>
        {ONBOARDING_HABIT_SUGGESTIONS.map((suggestion) => (
          <Chip
            key={suggestion.key}
            active={selectedSuggestion === suggestion.key}
            onPress={() => selectSuggestion(suggestion)}
          >
            {t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`)}
          </Chip>
        ))}
      </View>

      <View style={styles.createBtnWrap}>
        <PillButton
          fullWidth
          disabled={!title.trim() || isCreating}
          busy={isCreating}
          onPress={handleCreate}
          leading={
            isCreating ? (
              <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
            ) : undefined
          }
        >
          {isCreating
            ? t('onboarding.flow.createHabit.creating')
            : t('onboarding.flow.createHabit.create')}
        </PillButton>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      gap: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      letterSpacing: -0.24,
      lineHeight: 31,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
    },
    sectionLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: 6,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    createBtnWrap: {
      marginTop: 8,
    },
    successCard: {
      paddingVertical: 24,
      alignItems: 'center',
      gap: 6,
    },
    successIcon: {
      width: 56,
      height: 56,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    successTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 17,
      color: tokens.fg1,
    },
    successFreq: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      letterSpacing: 0.24,
    },
    successMessage: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      marginTop: 8,
    },
  })
}
