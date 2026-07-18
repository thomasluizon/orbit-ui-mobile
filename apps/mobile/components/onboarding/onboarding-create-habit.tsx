import { useEffect, useState, useMemo, useCallback } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native'
import { Check, Settings2 } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOnboardingActions } from './onboarding-actions-context'
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
import { MAX_HABIT_TITLE_LENGTH } from '@orbit/shared/validation'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
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
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { showError } = useAppToast()
  const prefersReducedMotion = usePrefersReducedMotion()
  const successScale = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (!isCreated) return
    if (prefersReducedMotion) {
      successScale.setValue(1)
      return
    }
    const animation = Animated.spring(successScale, {
      toValue: 1,
      stiffness: 260,
      damping: 20,
      mass: 0.9,
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [isCreated, prefersReducedMotion, successScale])

  const actions = useOnboardingActions()

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

  const handleCreate = useCallback(async () => {
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

    setIsCreating(true)
    try {
      const created = await actions.createHabit({
        title: title.trim(),
        frequencyQuantity: 1,
        ...(frequencyUnit ? { frequencyUnit } : {}),
      })
      setIsCreated(true)
      setTimeout(() => {
        onCreated(created.id, created.title)
      }, 1500)
    } catch (err: unknown) {
      setIsCreating(false)
      showError(
        getFriendlyErrorMessage(err, translate, 'errors.createHabit', 'habit'),
      )
    }
  }, [
    title,
    frequencyUnit,
    isCreating,
    actions,
    onCreated,
    showError,
    translate,
  ])

  if (isCreated) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <Animated.View
            style={[
              styles.successIcon,
              {
                opacity: successScale,
                transform: [
                  {
                    scale: successScale.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Check size={26} color={tokens.fgOnPrimary} strokeWidth={2.4} />
          </Animated.View>
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
        maxLength={MAX_HABIT_TITLE_LENGTH}
        editable={!isCreating}
        returnKeyType="done"
        onSubmitEditing={() => void handleCreate()}
      />

      <View style={styles.toggleRow}>
        <Chip
          active={showFrequencyPicker}
          leading={<Settings2 size={11} strokeWidth={1.5} color={tokens.fg2} />}
          onPress={() => setShowFrequencyPicker((value) => !value)}
        >
          {t('onboarding.flow.createHabit.useForm')}
        </Chip>
      </View>

      {showFrequencyPicker && (
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
      )}

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
          onPress={() => void handleCreate()}
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
    toggleRow: {
      alignItems: 'center',
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
