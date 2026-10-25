'use client'

import { IconButton } from '@/components/ui/icon-button'

import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { Plus, X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { DateField } from '@/components/ui/date-field'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import { isGoalDeadlinePast } from '@orbit/shared/utils/goal-form'
import { GoalGroupLabel } from '../goal-group-label'

interface EditGoalDeadlineFieldProps {
  deadline: string
  onChangeDeadline: (next: string) => void
}

export function EditGoalDeadlineField({
  deadline,
  onChangeDeadline,
}: Readonly<EditGoalDeadlineFieldProps>) {
  const t = useTranslations()
  return (
    <div style={{ padding: "var(--orbit-space-16) var(--orbit-space-0) var(--orbit-space-16)" }}>
      <GoalGroupLabel top={SPACING.s0}>
        {t('goals.form.deadline')}{' '}
        <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>
          ({t('goals.form.deadlineOptional')})
        </span>
      </GoalGroupLabel>
      {deadline ? (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <div className="flex-1">
              <DateField value={deadline} onChange={onChangeDeadline} />
            </div>
            <button
              type="button"
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
              style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, color: 'var(--fg-3)' }}
              aria-label={t('goals.form.removeDeadline')}
              onClick={() => onChangeDeadline('')}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
          {isGoalDeadlinePast(deadline) && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--status-overdue-text)',
              }}
            >
              {t('goals.form.deadlineInPast')}
            </p>
          )}
        </div>
      ) : (
        <IconButton label={t('goals.form.addDeadline')} onClick={() => onChangeDeadline(formatAPIDate(new Date()))}><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      )}
    </div>
  )
}
