'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, X, Target, Flame } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { PillButton } from '@/components/ui/pill-button'
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
import { MAX_GOAL_DESCRIPTION_LENGTH, MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'

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

const goalTypeOptions = [
  {
    key: 'Standard',
    titleKey: 'goals.form.typeStandard',
    descKey: 'goals.form.typeStandardDescription',
    icon: Target,
  },
  {
    key: 'Streak',
    titleKey: 'goals.form.typeStreak',
    descKey: 'goals.form.typeStreakHintGood',
    hintKey: 'goals.form.typeStreakHintBad',
    icon: Flame,
  },
] as const

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

export function CreateGoalModal({ open, onOpenChange }: Readonly<CreateGoalModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: GoalModalTranslateValues) => t(key, values),
    [t],
  )
  const createGoal = useCreateGoal()
  const { showError } = useAppToast()

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

  const resetForm = useCallback(() => {
    setGoalType('Standard')
    setDescription('')
    setTargetValue('')
    setUnit('')
    setDeadline('')
    setSubmitted(false)
  }, [])

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

  const activeTypeOption =
    goalTypeOptions.find((option) => option.key === goalType) ?? goalTypeOptions[0]

  const handleTypeChange = useCallback(
    (type: GoalType) => {
      setGoalType(type)
      if (type === 'Streak') {
        setUnit(t('goals.form.streakUnit'))
      } else {
        setUnit('')
      }
    },
    [t],
  )

  const onSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()
      setSubmitted(true)

      const err = translateErrorKey(
        translate,
        validateGoalDraftInput(description, targetValue, unit),
      )
      if (err) {
        showError(err)
        return
      }

      const parsedTargetValue = parseGoalTargetValue(targetValue)
      if (parsedTargetValue === null) return

      try {
        const title = buildGoalTitle(description, targetValue, unit)
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
    [createGoal, deadline, description, goalType, onOpenChange, resetForm, showError, targetValue, translate, unit],
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
        <form id="create-goal-form" onSubmit={onSubmit} noValidate>
          <GoalGroupLabel>{t('goals.form.type')}</GoalGroupLabel>
          <div
            className="flex"
            role="radiogroup"
            aria-label={t('goals.form.type')}
            style={{ gap: 10 }}
          >
            {goalTypeOptions.map((option) => {
              const isActive = goalType === option.key
              const Icon = option.icon
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleTypeChange(option.key as GoalType)}
                  className="flex flex-1 cursor-pointer appearance-none items-center justify-center transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
                  style={{
                    gap: 8,
                    minHeight: 46,
                    borderRadius: 14,
                    border: 0,
                    background: isActive ? 'var(--primary)' : 'var(--bg-elev)',
                    boxShadow: isActive ? 'none' : 'inset 0 0 0 1px var(--hairline)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: isActive ? 'var(--fg-on-primary)' : 'var(--fg-2)',
                  }}
                >
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                  {t(option.titleKey)}
                </button>
              )
            })}
          </div>
          <div style={{ padding: '10px 0 12px' }}>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--fg-3)',
                lineHeight: 1.5,
              }}
            >
              {t(activeTypeOption.descKey)}
            </div>
            {'hintKey' in activeTypeOption && activeTypeOption.hintKey && (
              <div
                style={{
                  marginTop: 4,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  color: 'var(--fg-3)',
                  lineHeight: 1.4,
                }}
              >
                {t(activeTypeOption.hintKey)}
              </div>
            )}
          </div>

          <div className={isStreak ? '' : 'grid grid-cols-2'} style={{ padding: '8px 0 0', gap: 12 }}>
            <FieldWell
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
              <FieldWell
                label={t('goals.form.unit')}
                id="create-goal-unit"
                type="text"
                value={unit}
                placeholder={t('goals.form.unitPlaceholder')}
                maxLength={MAX_GOAL_UNIT_LENGTH}
                error={fieldErrors.unit}
                onChange={setUnit}
              />
            )}
          </div>

          <div style={{ padding: '16px 0 0' }}>
            <FieldWell
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

          <GoalGroupLabel top={18}>{t('goals.form.deadline')}</GoalGroupLabel>
          <div style={{ padding: '0 0 16px' }}>
            {deadline ? (
              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="flex-1">
                  <AppDatePicker value={deadline} onChange={setDeadline} />
                </div>
                <button
                  type="button"
                  className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
                  style={{
                    width: 44,
                    height: 44,
                    color: 'var(--fg-3)',
                  }}
                  aria-label={t('common.cancel')}
                  onClick={() => setDeadline('')}
                >
                  <X size={16} strokeWidth={1.8} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                  padding: '6px 0',
                  gap: 6,
                }}
                onClick={() => setDeadline(formatAPIDate(new Date()))}
              >
                <Plus size={14} strokeWidth={1.8} />
                {t('goals.form.addDeadline')}
              </button>
            )}
            {deadline && isGoalDeadlinePast(deadline) && (
              <p
                style={{
                  marginTop: 8,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--status-overdue-text)',
                }}
              >
                {t('goals.form.deadlineInPast')}
              </p>
            )}
          </div>

          <div
            className="flex items-center"
            style={{
              gap: 12,
              padding: '18px 0 8px',
            }}
          >
            <PillButton
              variant="ghost"
              className="flex-1"
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--primary)] text-[var(--fg-on-primary)] transition-[background-color,box-shadow,transform,opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--primary-pressed)] enabled:hover:-translate-y-px enabled:hover:shadow-[var(--primary-glow-hover)] enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                padding: '15px 26px',
                boxShadow: isSubmitting ? 'none' : 'var(--primary-glow)',
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

interface GoalGroupLabelProps {
  children: React.ReactNode
  top?: number
}

/** meta-criar group label: Rubik 14/500 fg-2 over the field group. */
function GoalGroupLabel({ children, top = 4 }: Readonly<GoalGroupLabelProps>) {
  return (
    <div
      style={{
        padding: `${top}px 0 8px`,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--fg-2)',
      }}
    >
      {children}
    </div>
  )
}

interface FieldWellProps {
  label: string
  id: string
  type: 'text' | 'number'
  mono?: boolean
  value: string
  placeholder?: string
  maxLength?: number
  error?: string
  onChange: (next: string) => void
}

/** Kit field well with native min/step semantics and inline error slot. */
function FieldWell({
  label,
  id,
  type,
  mono = false,
  value,
  placeholder,
  maxLength,
  error,
  onChange,
}: Readonly<FieldWellProps>) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <label
        htmlFor={id}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--fg-2)',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        step={type === 'number' ? 'any' : undefined}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-[14px] border-0 bg-[var(--bg-field)] text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--hairline)] outline-none placeholder:text-[var(--fg-3)] focus:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          minHeight: 54,
          padding: '0 16px',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 16,
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--status-overdue-text)',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
