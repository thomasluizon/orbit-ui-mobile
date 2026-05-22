import { useState, useMemo, useCallback } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateHabit } from '@/hooks/use-habits'
import { UnderlinedInput } from '@/components/ui/underlined-input'
import { Chip } from '@/components/ui/chip'
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
 * v8 step 3: "Tell Astra what to track." Underlined large input, suggestion
 * chips, frequency chip row, primary CTA.
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
            <Check size={22} color={tokens.primary} strokeWidth={2} />
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

      <UnderlinedInput
        large
        value={title}
        onChangeText={setTitle}
        placeholder={t('onboarding.flow.createHabit.placeholder')}
        maxLength={200}
        editable={!isCreating}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />

      <Text style={styles.sectionLabel}>
        {t('onboarding.flow.createHabit.frequency.daily')}
      </Text>
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
        {t('onboarding.flow.createHabit.title')}
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

      <Pressable
        style={({ pressed }) => [
          styles.createBtn,
          {
            backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
          },
          (!title.trim() || isCreating) && styles.createBtnDisabled,
        ]}
        disabled={!title.trim() || isCreating}
        onPress={handleCreate}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
        ) : (
          <Text style={[styles.createBtnText, { color: tokens.fgOnPrimary }]}>
            {t('onboarding.flow.createHabit.create')}
          </Text>
        )}
      </Pressable>
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
      fontFamily: 'Geist',
      fontSize: 22,
      fontWeight: '600',
      letterSpacing: -0.33,
      lineHeight: 25,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Geist',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
      textAlign: 'center',
    },
    sectionLabel: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fg3,
      marginTop: 6,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    createBtn: {
      marginTop: 8,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createBtnDisabled: {
      opacity: 0.5,
    },
    createBtnText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
    // Success state
    successCard: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: tokens.hairline,
      paddingVertical: 24,
      alignItems: 'center',
      gap: 6,
    },
    successIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: tokens.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    successTitle: {
      fontFamily: 'Geist',
      fontSize: 17,
      fontWeight: '600',
      color: tokens.fg1,
    },
    successFreq: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      color: tokens.fg3,
      letterSpacing: 0.44,
    },
    successMessage: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.fg2,
      marginTop: 8,
    },
  })
}
