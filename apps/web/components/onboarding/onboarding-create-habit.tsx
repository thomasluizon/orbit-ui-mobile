'use client'

import { useState, useCallback } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCreateHabit } from '@/hooks/use-habits'
import { getErrorMessage } from '@orbit/shared/utils'
import type { FrequencyUnit } from '@orbit/shared/types/habit'

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

interface OnboardingCreateHabitProps {
  onCreated: (habitId: string, title: string) => void
}

export function OnboardingCreateHabit({ onCreated }: OnboardingCreateHabitProps) {
  const t = useTranslations()
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

  const handleCreate = useCallback(async () => {
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
          // Auto-advance after success animation
          setTimeout(() => {
            onCreated(result.id, title.trim())
          }, 1500)
        },
        onError: (err: unknown) => {
          setError(getErrorMessage(err, t('errors.createHabit')))
        },
      },
    )
  }, [title, frequencyUnit, isCreating, createHabit, onCreated])

  if (isCreated) {
    return (
      <div className="text-center">
        <div className="animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="bg-surface-elevated rounded-[var(--radius-xl)] border border-border p-6">
            {/* Checkmark */}
            <div className="flex justify-center mb-4">
              <div className="size-14 rounded-full bg-success/10 flex items-center justify-center animate-complete-pop">
                <Check className="size-7 text-success" />
              </div>
            </div>

            {/* Habit info */}
            <p className="text-lg font-bold text-text-primary">{title}</p>
            <p className="text-xs text-text-secondary mt-1">
              {frequencyUnit
                ? t(`onboarding.flow.createHabit.frequency.${frequencyUnit === 'Day' ? 'daily' : frequencyUnit === 'Week' ? 'weekly' : 'oneTime'}`)
                : t('onboarding.flow.createHabit.frequency.oneTime')}
            </p>
            <p className="text-sm text-success font-medium mt-3">
              {t('onboarding.flow.createHabit.success')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        {t('onboarding.flow.createHabit.title')}
      </h1>
      <p className="text-sm text-text-secondary leading-relaxed mb-6">
        {t('onboarding.flow.createHabit.subtitle')}
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
            {t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`)}
          </button>
        ))}
      </div>

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="form-input w-full"
        placeholder={t('onboarding.flow.createHabit.placeholder')}
        disabled={isCreating}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
      />

      {/* Frequency picker */}
      <div className="flex gap-2 mt-4">
        {frequencies.map((freq) => (
          <button
            key={freq.value}
            className={`flex-1 py-2.5 rounded-[var(--radius-xl)] text-sm font-semibold text-center transition-all ${
              activeFrequency === freq.value
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary'
            }`}
            disabled={isCreating}
            onClick={() => selectFrequency(freq.value)}
          >
            {t(freq.labelKey)}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-3 text-sm text-danger">{error}</p>
      )}

      {/* Create button */}
      <button
        className={`w-full mt-6 py-3.5 rounded-[var(--radius-xl)] font-bold text-base transition-all active:scale-[0.98] ${
          title.trim()
            ? 'bg-primary text-white shadow-[var(--shadow-glow)] hover:bg-primary/90'
            : 'bg-primary/50 text-white/50 cursor-not-allowed'
        }`}
        disabled={!title.trim() || isCreating}
        onClick={handleCreate}
      >
        {isCreating ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {t('onboarding.flow.createHabit.creating')}
          </span>
        ) : (
          t('onboarding.flow.createHabit.create')
        )}
      </button>
    </div>
  )
}
