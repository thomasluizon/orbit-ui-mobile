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
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'

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
            boxShadow: '0 8px 28px rgba(var(--primary-rgb), 0.45)',
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
            fontFamily: 'var(--font-sans)',
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {title}
        </div>
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
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
    <div
      className="stagger-enter"
      style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '16px 0' }}
    >
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
        {t('onboarding.flow.createHabit.title')}
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
        {t('onboarding.flow.createHabit.subtitle')}
      </div>

      <FieldInput
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
              className={
                'flex-1 appearance-none border-0 cursor-pointer transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ' +
                (activeFrequency === freq.value
                  ? ''
                  : 'hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg-1)]')
              }
              disabled={isCreating}
              onClick={() => selectFrequency(freq.value)}
              style={{
                height: 42,
                padding: '0 12px',
                borderRadius: 12,
                background:
                  activeFrequency === freq.value ? 'var(--primary)' : 'var(--bg-elev)',
                color:
                  activeFrequency === freq.value
                    ? 'var(--fg-on-primary)'
                    : 'var(--fg-3)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
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

      <div style={{ marginTop: 12 }}>
        <PillButton
          fullWidth
          disabled={!title.trim() || isCreating}
          busy={isCreating}
          onClick={handleCreate}
          leading={isCreating ? <Loader2 className="size-4 animate-spin" /> : undefined}
        >
          {isCreating
            ? t('onboarding.flow.createHabit.creating')
            : t('onboarding.flow.createHabit.create')}
        </PillButton>
      </div>
    </div>
  )
}
