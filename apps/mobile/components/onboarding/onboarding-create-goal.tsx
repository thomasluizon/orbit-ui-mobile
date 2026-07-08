import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOnboardingActions } from './onboarding-actions-context'
import { FieldInput } from '@/components/ui/field-input'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import {
  getFriendlyErrorMessage,
  ONBOARDING_GOAL_SUGGESTIONS,
  parseGoalTargetValue,
  translateErrorKey,
  validateGoalDraftInput,
} from '@orbit/shared/utils'
import { MAX_GOAL_TITLE_LENGTH, MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import { createTokensV2, primaryGlow, type AppTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

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

/**
 * Goal step: Pro badge, kit field wells, suggestion chips, pill CTA. Pure
 * visual rewrite -- preserves goal-creation flow.
 */
export function OnboardingCreateGoal({
  onCreated,
  onSkip,
}: Readonly<OnboardingCreateGoalProps>) {
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
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [isCreated, setIsCreated] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  )
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
    setTargetValue(String(suggestion.target))
    setUnit(suggestion.unit)
    setSelectedSuggestion(suggestion.key)
  }

  const parsedTargetValue = parseGoalTargetValue(targetValue)
  const canCreate =
    !!parsedTargetValue && parsedTargetValue > 0 && unit.trim().length > 0

  const handleCreate = useCallback(async () => {
    if (!canCreate || isCreating) return

    const validationError = translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
    if (validationError) {
      showError(validationError)
      return
    }

    const title = description.trim() || `${parsedTargetValue} ${unit.trim()}`
    setIsCreating(true)
    try {
      await actions.createGoal({
        title,
        targetValue: parsedTargetValue,
        unit: unit.trim(),
      })
      setIsCreated(true)
      setTimeout(() => {
        onCreated()
      }, 1500)
    } catch (err: unknown) {
      setIsCreating(false)
      showError(
        getFriendlyErrorMessage(err, translate, 'goals.errors.create', 'goal'),
      )
    }
  }, [
    canCreate,
    actions,
    description,
    isCreating,
    onCreated,
    parsedTargetValue,
    showError,
    targetValue,
    translate,
    unit,
  ])

  if (isCreated) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <Animated.View
            style={[
              styles.successIcon,
              primaryGlow(tokens),
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

  return (
    <View style={styles.container}>
      <View style={styles.proBadgeRow}>
        <ProBadge />
      </View>

      <Text style={styles.title}>
        {t('onboarding.flow.createGoal.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.createGoal.subtitle')}
      </Text>

      <FieldInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('onboarding.flow.createGoal.descriptionPlaceholder')}
        maxLength={MAX_GOAL_TITLE_LENGTH}
        editable={!isCreating}
      />

      <View style={styles.formRow}>
        <View style={styles.formCol}>
          <FieldInput
            mono
            value={targetValue}
            onChangeText={setTargetValue}
            placeholder={t('onboarding.flow.createGoal.targetPlaceholder')}
            keyboardType="numeric"
            editable={!isCreating}
          />
        </View>
        <View style={styles.formCol}>
          <FieldInput
            value={unit}
            onChangeText={setUnit}
            placeholder={t('onboarding.flow.createGoal.unitPlaceholder')}
            maxLength={MAX_GOAL_UNIT_LENGTH}
            editable={!isCreating}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>
        {t('onboarding.flow.createGoal.starters')}
      </Text>
      <View style={styles.chipsRow}>
        {suggestions.map((suggestion) => (
          <Chip
            key={suggestion.key}
            active={selectedSuggestion === suggestion.key}
            onPress={() => selectSuggestion(suggestion)}
          >
            {suggestion.title}
          </Chip>
        ))}
      </View>

      <View style={styles.createBtnWrap}>
        <PillButton
          fullWidth
          disabled={!canCreate || isCreating}
          busy={isCreating}
          onPress={() => void handleCreate()}
          leading={
            isCreating ? (
              <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
            ) : undefined
          }
        >
          {isCreating
            ? t('onboarding.flow.createGoal.creating')
            : t('onboarding.flow.createGoal.create')}
        </PillButton>
      </View>

      <Pressable
        disabled={isCreating}
        onPress={onSkip}
        style={({ pressed }) => [styles.skipBtn, pressed && styles.textButtonPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.skipBtnText}>
          {t('onboarding.flow.createGoal.skipStep')}
        </Text>
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
    proBadgeRow: {
      alignItems: 'center',
      paddingTop: 4,
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
    formRow: {
      flexDirection: 'row',
      gap: 12,
    },
    formCol: {
      flex: 1,
    },
    sectionLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: 4,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    createBtnWrap: {
      marginTop: 8,
    },
    skipBtn: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textButtonPressed: {
      transform: [{ scale: 0.96 }],
      opacity: 0.7,
    },
    skipBtnText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
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
      fontFamily: 'Roboto_500Medium',
      fontSize: 20,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    successDesc: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
    successMessage: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.primary,
      marginTop: 8,
    },
  })
}
