'use client'

import { useState, useMemo, useCallback } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCreateGoal } from '@/hooks/use-goals'
import { getErrorMessage } from '@orbit/shared/utils'

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

export function OnboardingCreateGoal({ onCreated, onSkip }: OnboardingCreateGoalProps) {
  const t = useTranslations()
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState<number | undefined>(undefined)
  const [unit, setUnit] = useState('')
  const [isCreated, setIsCreated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)

  const createGoal = useCreateGoal()
  const isCreating = createGoal.isPending

  const suggestions = useMemo<GoalSuggestion[]>(() => [
    { key: 'run', title: t('onboarding.flow.createGoal.suggestions.run'), target: 100, unit: 'km' },
    { key: 'books', title: t('onboarding.flow.createGoal.suggestions.books'), target: 12, unit: t('onboarding.flow.createGoal.suggestions.booksUnit') },
    { key: 'save', title: t('onboarding.flow.createGoal.suggestions.save'), target: 5000, unit: '$' },
  ], [t])

  function selectSuggestion(suggestion: GoalSuggestion) {
    setDescription(suggestion.title)
    setTargetValue(suggestion.target)
    setUnit(suggestion.unit)
    setSelectedSuggestion(suggestion.key)
  }

  const canCreate = targetValue && targetValue > 0 && unit.trim()

  const handleCreate = useCallback(async () => {
    if (!canCreate || isCreating) return

    setError(null)

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
          setError(getErrorMessage(err, t('goals.errors.create')))
        },
      },
    )
  }, [canCreate, isCreating, description, targetValue, unit, createGoal, onCreated])

  if (isCreated) {
    return (
      <div className="text-center">
        <div className="animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="bg-surface-elevated rounded-[var(--radius-xl)] border border-border p-6">
            <div className="flex justify-center mb-4">
              <div className="size-14 rounded-full bg-success/10 flex items-center justify-center animate-complete-pop">
                <Check className="size-7 text-success" />
              </div>
            </div>
            <p className="text-lg font-bold text-text-primary">{targetValue} {unit}</p>
            {description.trim() && (
              <p className="text-xs text-text-secondary mt-1">{description}</p>
            )}
            <p className="text-sm text-success font-medium mt-3">
              {t('onboarding.flow.createGoal.success')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center">
      {/* Form state */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <h1 className="text-2xl font-bold text-text-primary">
          {t('onboarding.flow.createGoal.title')}
        </h1>
        <span className="text-xs font-medium text-text-muted bg-surface-elevated px-2.5 py-1 rounded-full">
          {t('onboarding.flow.createGoal.optional')}
        </span>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed mb-6">
        {t('onboarding.flow.createGoal.subtitle')}
      </p>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.key}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 active:scale-95 ${
              selectedSuggestion === suggestion.key
                ? 'bg-primary/10 border border-primary/30 text-primary'
                : 'bg-surface-elevated border border-border-muted text-text-secondary hover:border-primary/30 hover:text-text-primary hover:bg-primary/5'
            }`}
            onClick={() => selectSuggestion(suggestion)}
          >
            {suggestion.title}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="space-y-3 text-left">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            value={targetValue ?? ''}
            onChange={(e) => setTargetValue(e.target.value ? Number(e.target.value) : undefined)}
            className="form-input w-full"
            placeholder={t('onboarding.flow.createGoal.targetPlaceholder')}
            min={1}
            disabled={isCreating}
          />
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="form-input w-full"
            placeholder={t('onboarding.flow.createGoal.unitPlaceholder')}
            disabled={isCreating}
          />
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="form-input w-full"
          placeholder={t('onboarding.flow.createGoal.descriptionPlaceholder')}
          disabled={isCreating}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="mt-3 text-sm text-danger">{error}</p>
      )}

      {/* Create button */}
      <button
        className={`w-full mt-6 py-3.5 rounded-[var(--radius-xl)] font-bold text-base transition-all active:scale-[0.98] ${
          canCreate
            ? 'bg-primary text-white shadow-[var(--shadow-glow)] hover:bg-primary/90'
            : 'bg-primary/50 text-white/50 cursor-not-allowed'
        }`}
        disabled={!canCreate || isCreating}
        onClick={handleCreate}
      >
        {isCreating ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {t('onboarding.flow.createGoal.creating')}
          </span>
        ) : (
          t('onboarding.flow.createGoal.create')
        )}
      </button>

      {/* Skip button */}
      <button
        className="w-full py-3 text-text-secondary text-sm font-medium hover:text-text-primary transition-colors mt-2"
        disabled={isCreating}
        onClick={onSkip}
      >
        {t('onboarding.flow.createGoal.skipStep')}
      </button>
    </div>
  )
}
