'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useUpdateGoal } from '@/hooks/use-goals'
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
import { MAX_GOAL_DESCRIPTION_LENGTH } from '@orbit/shared/validation'

interface EditGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: {
    id: string
    title: string
    targetValue: number
    unit: string
    deadline: string | null
    type?: string
  }
}

interface UpdateGoalRequest {
  title: string
  targetValue: number
  unit: string
  deadline?: string | null
}

export function EditGoalModal({
  open,
  onOpenChange,
  goal,
}: Readonly<EditGoalModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const updateGoal = useUpdateGoal()
  const { showError } = useAppToast()

  const isStreak = isStreakGoal(goal.type)

  const [description, setDescription] = useState(() => goal.title)
  const [targetValue, setTargetValue] = useState(() => String(goal.targetValue))
  const [unit, setUnit] = useState(() => goal.unit)
  const [deadline, setDeadline] = useState(() => goal.deadline ?? '')
  const [submitted, setSubmitted] = useState(false)

  const isSubmitting = updateGoal.isPending
  const isDirty =
    description !== goal.title ||
    targetValue !== String(goal.targetValue) ||
    unit !== goal.unit ||
    deadline !== (goal.deadline ?? '')
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => onOpenChange(false),
  })

  const fieldErrors = useMemo(() => {
    if (!submitted) return {}
    const errs: Record<string, string> = {}
    const errorKey = validateGoalDraftInput(description, targetValue, unit)
    if (errorKey) {
      const translated = translateErrorKey(translate, errorKey)
      if (translated) {
        if (errorKey === 'goals.form.targetValueRequired') errs.targetValue = translated
        else if (errorKey === 'goals.form.unitRequired' || errorKey === 'goals.form.unitTooLong') errs.unit = translated
        else if (errorKey === 'goals.form.titleRequired' || errorKey === 'goals.form.titleTooLong') errs.description = translated
        else errs._form = translated
      }
    }
    return errs
  }, [submitted, description, targetValue, unit, translate])

  const [previousSession, setPreviousSession] = useState<{ open: boolean; id: string | null }>({
    open,
    id: open ? goal.id : null,
  })
  const nextSessionId = open ? goal.id : null
  if (previousSession.open !== open || previousSession.id !== nextSessionId) {
    setPreviousSession({ open, id: nextSessionId })
    if (open && (!previousSession.open || previousSession.id !== goal.id)) {
      setDescription(goal.title)
      setTargetValue(String(goal.targetValue))
      setUnit(goal.unit)
      setDeadline(goal.deadline ?? '')
      setSubmitted(false)
    }
  }

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
        const request: UpdateGoalRequest = {
          title,
          targetValue: parsedTargetValue,
          unit: unit.trim(),
          deadline: deadline || null,
        }

        await updateGoal.mutateAsync({ goalId: goal.id, data: request })
        onOpenChange(false)
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
      }
    },
    [deadline, description, goal.id, onOpenChange, showError, targetValue, translate, unit, updateGoal],
  )

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={t('goals.detail.edit')}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <form onSubmit={onSubmit}>
          {isStreak && (
            <div
              style={{
                padding: '10px 0',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-3)',
                letterSpacing: '0.04em',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              {t('goals.form.typeStreak')}
            </div>
          )}

          <div className={isStreak ? '' : 'grid grid-cols-2'} style={{ padding: '16px 0 0', gap: 12 }}>
            <FieldWell
              label={isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
              id="edit-goal-target"
              type="number"
              mono
              value={targetValue}
              error={fieldErrors.targetValue}
              onChange={setTargetValue}
            />
            {isStreak ? (
              <FieldWell
                label={t('goals.form.unit')}
                id="edit-goal-unit-readonly"
                type="text"
                value={unit}
                readOnly
                onChange={() => {}}
              />
            ) : (
              <FieldWell
                label={t('goals.form.unit')}
                id="edit-goal-unit"
                type="text"
                value={unit}
                maxLength={50}
                error={fieldErrors.unit}
                onChange={setUnit}
              />
            )}
          </div>

          <div style={{ padding: '16px 0 0' }}>
            <FieldWell
              label={t('goals.form.description')}
              id="edit-goal-description"
              type="text"
              value={description}
              placeholder={t('goals.form.descriptionPlaceholder')}
              maxLength={MAX_GOAL_DESCRIPTION_LENGTH}
              error={fieldErrors.description}
              onChange={setDescription}
            />
          </div>

          <div style={{ padding: '16px 0 16px' }}>
            {deadline ? (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--fg-2)',
                  }}
                >
                  {t('goals.form.deadline')}
                </span>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <div className="flex-1">
                    <AppDatePicker value={deadline} onChange={setDeadline} />
                  </div>
                  <button
                    type="button"
                    className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
                    style={{ width: 44, height: 44, color: 'var(--fg-3)' }}
                    aria-label={t('common.cancel')}
                    onClick={() => setDeadline('')}
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
                {isGoalDeadlinePast(deadline) && (
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: 'var(--status-overdue)',
                    }}
                  >
                    {t('goals.form.deadlineInPast')}
                  </p>
                )}
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
              {isSubmitting ? '...' : t('common.save')}
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

interface FieldWellProps {
  label: string
  id: string
  type: 'text' | 'number'
  mono?: boolean
  value: string
  placeholder?: string
  maxLength?: number
  readOnly?: boolean
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
  readOnly = false,
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
        readOnly={readOnly}
        min={type === 'number' ? 0.01 : undefined}
        step={type === 'number' ? 'any' : undefined}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-[14px] border-0 bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)] outline-none placeholder:text-[var(--fg-4)] focus:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          minHeight: 54,
          padding: '0 16px',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 16,
          color: readOnly ? 'var(--fg-3)' : 'var(--fg-1)',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          opacity: readOnly ? 0.6 : 1,
        }}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--status-overdue)',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
