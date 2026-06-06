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
import { useCreateGoal } from '@/hooks/use-goals'
import { UnderlinedInput } from '@/components/ui/underlined-input'
import { Chip } from '@/components/ui/chip'
import { ProBadge } from '@/components/ui/pro-badge'
import {
  getFriendlyErrorMessage,
  ONBOARDING_GOAL_SUGGESTIONS,
  parseGoalTargetValue,
  translateErrorKey,
  validateGoalDraftInput,
} from '@orbit/shared/utils'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
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
 * v8 step 5: "Add a longer arc." Pro badge, underlined inputs, suggestion
 * chips, primary CTA. Pure visual rewrite -- preserves goal-creation flow.
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
    setTargetValue(String(suggestion.target))
    setUnit(suggestion.unit)
    setSelectedSuggestion(suggestion.key)
  }

  const parsedTargetValue = parseGoalTargetValue(targetValue)
  const canCreate =
    !!parsedTargetValue && parsedTargetValue > 0 && unit.trim().length > 0

  const handleCreate = useCallback(() => {
    if (!canCreate || isCreating) return

    const validationError = translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
    if (validationError) {
      showError(validationError)
      return
    }

    if (parsedTargetValue === null) return

    const title = description.trim() || `${parsedTargetValue} ${unit.trim()}`
    createGoal.mutate(
      {
        title,
        targetValue: parsedTargetValue,
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
          showError(
            getFriendlyErrorMessage(err, translate, 'goals.errors.create', 'goal'),
          )
        },
      },
    )
  }, [
    canCreate,
    createGoal,
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
          <View style={styles.successIcon}>
            <Check size={22} color={tokens.primary} strokeWidth={2} />
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

      <UnderlinedInput
        large
        value={description}
        onChangeText={setDescription}
        placeholder={t('onboarding.flow.createGoal.descriptionPlaceholder')}
        maxLength={200}
        editable={!isCreating}
      />

      <View style={styles.formRow}>
        <View style={styles.formCol}>
          <UnderlinedInput
            mono
            value={targetValue}
            onChangeText={setTargetValue}
            placeholder={t('onboarding.flow.createGoal.targetPlaceholder')}
            keyboardType="numeric"
            editable={!isCreating}
          />
        </View>
        <View style={styles.formCol}>
          <UnderlinedInput
            value={unit}
            onChangeText={setUnit}
            placeholder={t('onboarding.flow.createGoal.unitPlaceholder')}
            maxLength={50}
            editable={!isCreating}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>
        {t('onboarding.flow.createHabit.title')}
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

      <Pressable
        style={({ pressed }) => [
          styles.createBtn,
          {
            backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
          },
          !canCreate && styles.createBtnDisabled,
        ]}
        disabled={!canCreate || isCreating}
        onPress={handleCreate}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
        ) : (
          <Text style={[styles.createBtnText, { color: tokens.fgOnPrimary }]}>
            {t('onboarding.flow.createGoal.create')}
          </Text>
        )}
      </Pressable>

      <Pressable
        disabled={isCreating}
        onPress={onSkip}
        style={styles.skipBtn}
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
    formRow: {
      flexDirection: 'row',
      gap: 12,
    },
    formCol: {
      flex: 1,
    },
    sectionLabel: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fg3,
      marginTop: 4,
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
    skipBtn: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    skipBtnText: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
    },
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
    successDesc: {
      fontFamily: 'Geist',
      fontSize: 12,
      color: tokens.fg3,
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
