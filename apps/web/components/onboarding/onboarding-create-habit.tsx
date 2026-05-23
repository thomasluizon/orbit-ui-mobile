'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2, Check, Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCreateHabit } from '@/hooks/use-habits'
import {
  getFriendlyErrorMessage,
  getOnboardingHabitFrequencyLabelKey,
  ONBOARDING_HABIT_FREQUENCIES,
  ONBOARDING_HABIT_SUGGESTIONS,
  translateErrorKey,
  validateHabitFormInput,
} from '@orbit/shared/utils'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { Chip } from '@/components/ui/chip'
import { SectionLabel } from '@/components/ui/section-label'
import { UnderlinedInput } from '@/components/ui/underlined-input'

interface Suggestion {
  key: string
  frequency: FrequencyUnit
}

interface OnboardingCreateHabitProps {
  onCreated: (habitId: string, title: string) => void
}

export function OnboardingCreateHabit({ onCreated }: Readonly<OnboardingCreateHabitProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const [title, setTitle] = useState('')
  const [frequencyUnit, setFrequencyUnit] = useState<FrequencyUnit | undefined>('Day')
  const [createdInfo, setCreatedInfo] = useState<{ id: string; title: string } | null>(null)
  const isCreated = createdInfo !== null
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false)
  const { showError } = useAppToast()

  useEffect(() => {
    if (!createdInfo) return
    const timer = setTimeout(() => {
      onCreated(createdInfo.id, createdInfo.title)
    }, 1500)
    return () => clearTimeout(timer)
  }, [createdInfo, onCreated])

  const createHabit = useCreateHabit()
  const isCreating = createHabit.isPending

  const activeFrequency = frequencyUnit ?? 'one-time'

  function selectSuggestion(suggestion: Suggestion) {
    setTitle(t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`))
    setFrequencyUnit(suggestion.frequency)
    setSelectedSuggestion(suggestion.key)
  }

  function selectFrequency(value: FrequencyUnit | 'one-time') {
    setFrequencyUnit(value === 'one-time' ? undefined : value)
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

    createHabit.mutate(
      {
        title: title.trim(),
        frequencyQuantity: 1,
        ...(frequencyUnit ? { frequencyUnit } : {}),
      },
      {
        onSuccess: (result) => {
          setCreatedInfo({ id: result.id, title: title.trim() })
        },
        onError: (err: unknown) => {
          showError(getFriendlyErrorMessage(err, translate, 'errors.createHabit', 'habit'))
        },
      },
    )
  }, [title, frequencyUnit, isCreating, createHabit, showError, translate])

  if (isCreated) {
    return (
      <div className="flex flex-col items-center" style={{ gap: 16, padding: '32px 0' }}>
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 56,
            height: 56,
            background: 'var(--primary)',
          }}
        >
          <Check className="size-7" style={{ color: 'var(--fg-on-primary)' }} strokeWidth={2.4} />
        </div>
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--fg-1)',
          }}
        >
          {title}
        </div>
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--fg-3)',
          }}
        >
          {t(getOnboardingHabitFrequencyLabelKey(frequencyUnit))}
          {' · '}
          {t('onboarding.flow.createHabit.success')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '16px 0' }}>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          lineHeight: 1.15,
          color: 'var(--fg-1)',
        }}
      >
        {t('onboarding.flow.createHabit.title')}
      </div>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          color: 'var(--fg-2)',
          lineHeight: 1.5,
        }}
      >
        {t('onboarding.flow.createHabit.subtitle')}
      </div>

      <UnderlinedInput
        large
        value={title}
        onChange={setTitle}
        placeholder={t('onboarding.flow.createHabit.placeholder')}
        maxLength={200}
        disabled={isCreating}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreate()
        }}
        ariaLabel={t('onboarding.flow.createHabit.placeholder')}
      />

      <div className="flex justify-center">
        <Chip
          active={showFrequencyPicker}
          leading={
            <Settings2 size={11} strokeWidth={1.5} color="var(--fg-2)" />
          }
          onClick={() => setShowFrequencyPicker((v) => !v)}
        >
          {t('onboarding.flow.createHabit.useForm')}
        </Chip>
      </div>

      {showFrequencyPicker && (
        <div className="flex" style={{ gap: 8 }}>
          {ONBOARDING_HABIT_FREQUENCIES.map((freq) => (
            <button
              type="button"
              key={freq.value}
              className="flex-1 appearance-none border-0 cursor-pointer"
              disabled={isCreating}
              onClick={() => selectFrequency(freq.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                background:
                  activeFrequency === freq.value ? 'var(--bg-elev)' : 'transparent',
                boxShadow:
                  activeFrequency === freq.value
                    ? 'inset 0 0 0 1px var(--fg-3)'
                    : 'inset 0 0 0 1px var(--hairline-strong)',
                color:
                  activeFrequency === freq.value ? 'var(--fg-1)' : 'var(--fg-2)',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {t(freq.labelKey)}
            </button>
          ))}
        </div>
      )}

      <SectionLabel top={8} bottom={6}>
        {t('onboarding.flow.createHabit.starters')}
      </SectionLabel>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {ONBOARDING_HABIT_SUGGESTIONS.map((suggestion) => (
          <Chip
            key={suggestion.key}
            active={selectedSuggestion === suggestion.key}
            onClick={() => selectSuggestion(suggestion)}
          >
            {t(`onboarding.flow.createHabit.suggestions.${suggestion.key}`)}
          </Chip>
        ))}
      </div>

      <button
        type="button"
        className="appearance-none border-0 cursor-pointer disabled:opacity-50"
        disabled={!title.trim() || isCreating}
        onClick={handleCreate}
        style={{
          padding: '12px 18px',
          marginTop: 12,
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          borderRadius: 10,
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {isCreating ? (
          <span className="inline-flex items-center justify-center" style={{ gap: 8 }}>
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
