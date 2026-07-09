'use client'

import { useState, useMemo, useCallback } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOnboardingActions } from './onboarding-actions-context'
import {
  getFriendlyErrorMessage,
  ONBOARDING_GOAL_SUGGESTIONS,
  parseGoalTargetValue,
  translateErrorKey,
  validateGoalDraftInput,
} from '@orbit/shared/utils'
import { MAX_GOAL_TITLE_LENGTH, MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import { Badge } from '@/components/ui/badge'
import { Chip } from '@/components/ui/chip'
import { SectionLabel } from '@/components/ui/section-label'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'

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

export function OnboardingCreateGoal({
  onCreated,
  onSkip,
}: Readonly<OnboardingCreateGoalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [isCreated, setIsCreated] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const { showError } = useAppToast()
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
      showError(getFriendlyErrorMessage(err, translate, 'goals.errors.create', 'goal'))
    } finally {
      setIsCreating(false)
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
      <div
        className="flex flex-col items-center"
        style={{ gap: 16, padding: '32px 0' }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 56,
            height: 56,
            background: 'var(--primary)',
            boxShadow: 'var(--primary-glow)',
            animation: 'fresh-start-orb 0.5s var(--ease-out) both',
          }}
        >
          <Check
            className="animate-check-pop size-7"
            style={{ color: 'var(--fg-on-primary)', animationDelay: '300ms' }}
            strokeWidth={2.4}
          />
        </div>
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {targetValue} {unit}
        </div>
        {description.trim() && (
          <div
            className="text-center"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
            }}
          >
            {description}
          </div>
        )}
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--primary)',
          }}
        >
          {t('onboarding.flow.createGoal.success')}
        </div>
      </div>
    )
  }

  return (
    <div
      className="stagger-enter"
      style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 0' }}
    >
      <div className="flex justify-center" style={{ paddingTop: 4 }}>
        <Badge>{t('onboarding.flow.createGoal.proTag')}</Badge>
      </div>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: 'var(--fg-1)',
        }}
      >
        {t('onboarding.flow.createGoal.title')}
      </div>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--fg-2)',
          lineHeight: 1.55,
        }}
      >
        {t('onboarding.flow.createGoal.subtitle')}
      </div>

      <FieldInput
        value={description}
        onChange={setDescription}
        placeholder={t('onboarding.flow.createGoal.descriptionPlaceholder')}
        maxLength={MAX_GOAL_TITLE_LENGTH}
        disabled={isCreating}
      />

      <div className="flex" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldInput
            mono
            type="number"
            inputMode="numeric"
            value={targetValue}
            onChange={setTargetValue}
            placeholder={t('onboarding.flow.createGoal.targetPlaceholder')}
            disabled={isCreating}
          />
        </div>
        <div style={{ flex: 1 }}>
          <FieldInput
            value={unit}
            onChange={setUnit}
            placeholder={t('onboarding.flow.createGoal.unitPlaceholder')}
            maxLength={MAX_GOAL_UNIT_LENGTH}
            disabled={isCreating}
          />
        </div>
      </div>

      <SectionLabel top={4} bottom={6}>
        {t('onboarding.flow.createGoal.starters')}
      </SectionLabel>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {suggestions.map((suggestion) => (
          <Chip
            key={suggestion.key}
            active={selectedSuggestion === suggestion.key}
            onClick={() => selectSuggestion(suggestion)}
          >
            {suggestion.title}
          </Chip>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <PillButton
          fullWidth
          disabled={!canCreate || isCreating}
          busy={isCreating}
          onClick={() => void handleCreate()}
          leading={isCreating ? <Loader2 className="size-4 animate-spin" /> : undefined}
        >
          {isCreating
            ? t('onboarding.flow.createGoal.creating')
            : t('onboarding.flow.createGoal.create')}
        </PillButton>
      </div>

      <div className="flex justify-center">
        <QuietLink onClick={onSkip} disabled={isCreating}>
          {t('onboarding.flow.createGoal.skipStep')}
        </QuietLink>
      </div>
    </div>
  )
}
