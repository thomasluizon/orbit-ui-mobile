'use client'

import { Plus, X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import { isGoalDeadlinePast } from '@orbit/shared/utils/goal-form'
import { GoalGroupLabel } from '../create-goal-modal/goal-group-label'

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
    <div style={{ padding: '16px 0 16px' }}>
      <GoalGroupLabel top={0}>
        {t('goals.form.deadline')}{' '}
        <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>
          ({t('goals.form.deadlineOptional')})
        </span>
      </GoalGroupLabel>
      {deadline ? (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <div className="flex-1">
              <AppDatePicker value={deadline} onChange={onChangeDeadline} />
            </div>
            <button
              type="button"
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
              style={{ width: 44, height: 44, color: 'var(--fg-3)' }}
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
                fontSize: 13,
                color: 'var(--status-overdue-text)',
              }}
            >
              {t('goals.form.deadlineInPast')}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center text-[var(--fg-1)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--primary)]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
            minHeight: 44,
            padding: 0,
            gap: 6,
          }}
          onClick={() => onChangeDeadline(formatAPIDate(new Date()))}
        >
          <Plus size={14} strokeWidth={1.8} />
          {t('goals.form.addDeadline')}
        </button>
      )}
    </div>
  )
}
