'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { SectionLabel } from '@/components/ui/section-label'
import { Chip } from '@/components/ui/chip'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useCreateGoal } from '@/hooks/use-goals'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
} from '@orbit/shared/utils'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  isStreakGoal,
  parseGoalTargetValue,
  validateGoalDraftInput,
} from '@orbit/shared/utils/goal-form'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateGoalRequest {
  title: string
  targetValue: number
  unit: string
  deadline?: string
  type?: GoalType
}

type GoalModalTranslateValues = Record<string, string | number | Date>
type GoalModalTranslateFn = (
  key: string,
  values?: GoalModalTranslateValues,
) => string

function buildGoalFieldErrors(
  submitted: boolean,
  description: string,
  targetValue: string,
  unit: string,
  translate: GoalModalTranslateFn,
) {
  if (!submitted) return {}

  const errorKey = validateGoalDraftInput(description, targetValue, unit)
  if (!errorKey) return {}

  const translated = translateErrorKey(translate, errorKey)
  if (!translated) return {}

  if (errorKey === 'goals.form.targetValueRequired') {
    return { targetValue: translated }
  }

  if (
    errorKey === 'goals.form.unitRequired' ||
    errorKey === 'goals.form.unitTooLong'
  ) {
    return { unit: translated }
  }

  if (
    errorKey === 'goals.form.titleRequired' ||
    errorKey === 'goals.form.titleTooLong'
  ) {
    return { description: translated }
  }

  return { _form: translated }
}

function buildCreateGoalRequest(
  title: string,
  parsedTargetValue: number,
  unit: string,
  goalType: GoalType,
  deadline: string,
): CreateGoalRequest {
  return {
    title,
    targetValue: parsedTargetValue,
    unit: unit.trim(),
    type: goalType,
    ...(deadline ? { deadline } : {}),
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateGoalModal({ open, onOpenChange }: Readonly<CreateGoalModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: GoalModalTranslateValues) => t(key, values),
    [t],
  )
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()

  // Form state
  const [goalType, setGoalType] = useState<GoalType>('Standard')
  const [description, setDescription] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = createGoal.isPending
  const isStreak = isStreakGoal(goalType)
  const isDirty =
    goalType !== 'Standard' ||
    description.trim().length > 0 ||
    targetValue.trim().length > 0 ||
    unit.trim().length > 0 ||
    deadline.length > 0
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => {
      resetForm()
      onOpenChange(false)
    },
  })

  const fieldErrors = useMemo(
    () =>
      buildGoalFieldErrors(
        submitted,
        description,
        targetValue,
        unit,
        translate,
      ),
    [submitted, description, targetValue, unit, translate],
  )

  function handleTypeChange(type: GoalType) {
    setGoalType(type)
    if (type === 'Streak') {
      setUnit(t('goals.form.streakUnit'))
    } else {
      setUnit('')
    }
  }

  function validate(): string | null {
    return translateErrorKey(
      translate,
      validateGoalDraftInput(description, targetValue, unit),
    )
  }

  function buildTitle(): string {
    return buildGoalTitle(description, targetValue, unit)
  }

  function resetForm() {
    setGoalType('Standard')
    setDescription('')
    setTargetValue('')
    setUnit('')
    setDeadline('')
    setSubmitted(false)
  }

  const onSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()
      setSubmitted(true)

      const err = validate()
      if (err) {
        showError(err)
        return
      }

      const parsedTargetValue = parseGoalTargetValue(targetValue)
      if (parsedTargetValue === null) return

      try {
        const title = buildTitle()
        const request = buildCreateGoalRequest(
          title,
          parsedTargetValue,
          unit,
          goalType,
          deadline,
        )

        await createGoal.mutateAsync(request)
        onOpenChange(false)
        resetForm()
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'goals.errors.create', 'goal'))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createGoal, deadline, description, goalType, onOpenChange, showError, targetValue, translate, unit],
  )

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={t('goals.create')}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <form id="create-goal-form" className="-mx-6" onSubmit={onSubmit}>
          {/* Goal Type chips */}
          <SectionLabel top={4}>{t('goals.form.type')}</SectionLabel>
          <div className="flex" style={{ padding: '0 20px 12px', gap: 6 }}>
            <Chip
              active={goalType === 'Standard'}
              onClick={() => handleTypeChange('Standard')}
            >
              {t('goals.form.typeStandard')}
            </Chip>
            <Chip
              active={goalType === 'Streak'}
              onClick={() => handleTypeChange('Streak')}
            >
              {t('goals.form.typeStreak')}
            </Chip>
          </div>

          {isStreak && (
            <div
              style={{
                padding: '4px 20px 12px',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--fg-3)',
                  lineHeight: 1.5,
                }}
              >
                {t('goals.form.typeStreakHintGood')}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--fg-3)',
                  lineHeight: 1.5,
                }}
              >
                {t('goals.form.typeStreakHintBad')}
              </p>
            </div>
          )}

          {/* Target row */}
          <div className={isStreak ? '' : 'grid grid-cols-2'} style={{ padding: '16px 20px 12px', gap: 14 }}>
            <UnderlinedField
              label={isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
              id="create-goal-target"
              type="number"
              mono
              value={targetValue}
              placeholder={isStreak ? t('goals.form.streakTargetPlaceholder') : '12'}
              error={fieldErrors.targetValue}
              onChange={setTargetValue}
            />
            {!isStreak && (
              <UnderlinedField
                label={t('goals.form.unit')}
                id="create-goal-unit"
                type="text"
                value={unit}
                placeholder={t('goals.form.unitPlaceholder')}
                maxLength={50}
                error={fieldErrors.unit}
                onChange={setUnit}
              />
            )}
          </div>

          {/* Description */}
          <div style={{ padding: '16px 20px 12px' }}>
            <UnderlinedField
              label={t('goals.form.description')}
              id="create-goal-description"
              type="text"
              value={description}
              placeholder={
                isStreak
                  ? t('goals.form.streakDescriptionPlaceholder')
                  : t('goals.form.descriptionPlaceholder')
              }
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              error={fieldErrors.description}
              onChange={setDescription}
            />
          </div>

          {/* Deadline */}
          <SectionLabel>{t('goals.form.deadline')}</SectionLabel>
          <div style={{ padding: '0 20px 16px' }}>
            {deadline ? (
              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="flex-1">
                  <AppDatePicker value={deadline} onChange={setDeadline} />
                </div>
                <button
                  type="button"
                  className="appearance-none border-0 bg-transparent cursor-pointer"
                  style={{
                    padding: 6,
                    color: 'var(--fg-3)',
                  }}
                  aria-label={t('common.cancel')}
                  onClick={() => setDeadline('')}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center"
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                  padding: 0,
                  gap: 6,
                }}
                onClick={() => setDeadline(formatAPIDate(new Date()))}
              >
                <Plus size={14} />
                {t('goals.form.addDeadline')}
              </button>
            )}
            {deadline && isGoalDeadlinePast(deadline) && (
              <p
                style={{
                  marginTop: 8,
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--status-overdue)',
                }}
              >
                {t('goals.form.deadlineInPast')}
              </p>
            )}
          </div>

          {/* Footer action row */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid var(--hairline)',
            }}
          >
            <button
              type="button"
              className="appearance-none border-0 bg-transparent cursor-pointer"
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--fg-3)',
                padding: 6,
              }}
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="appearance-none border-0 cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontWeight: 600,
                padding: '10px 18px',
                borderRadius: 8,
              }}
            >
              {isSubmitting ? '...' : t('goals.create')}
            </button>
          </div>
        </form>
      </AppOverlay>
      <ConfirmDialog
        open={dismissGuard.showDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissGuard.cancelDismiss()
        }}
        title={t('common.discardChangesTitle')}
        description={t('common.discardChangesDescription')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        onConfirm={dismissGuard.confirmDismiss}
        onCancel={dismissGuard.cancelDismiss}
        variant="warning"
      />
    </>
  )
}

interface UnderlinedFieldProps {
  label: string
  id: string
  type: 'text' | 'number'
  mono?: boolean
  value: string
  placeholder?: string
  maxLength?: number
  hideLabel?: boolean
  error?: string
  onChange: (next: string) => void
}

function UnderlinedField({
  label,
  id,
  type,
  mono = false,
  value,
  placeholder,
  maxLength,
  hideLabel = false,
  error,
  onChange,
}: Readonly<UnderlinedFieldProps>) {
  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      {!hideLabel && (
        <label
          htmlFor={id}
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--fg-3)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        min={type === 'number' ? 0.01 : undefined}
        step={type === 'number' ? 'any' : undefined}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          outline: 'none',
          fontFamily: mono ? 'var(--font-family-mono)' : 'var(--font-family-sans)',
          fontSize: 14,
          color: 'var(--fg-1)',
          padding: '6px 0',
          borderBottom: '1px solid var(--hairline-strong)',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          width: '100%',
        }}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
