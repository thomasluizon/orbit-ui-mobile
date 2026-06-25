'use client'

import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppDatePicker } from '@/components/ui/app-date-picker'
import { formatAPIDate } from '@orbit/shared/utils/dates'
import { isGoalDeadlinePast } from '@orbit/shared/utils/goal-form'
import { GoalGroupLabel } from './goal-group-label'

interface GoalDeadlineFieldProps {
  deadline: string
  onChangeDeadline: (next: string) => void
}

export function GoalDeadlineField({
  deadline,
  onChangeDeadline,
}: Readonly<GoalDeadlineFieldProps>) {
  const t = useTranslations()
  return (
    <>
      <GoalGroupLabel top={18}>{t('goals.form.deadline')}</GoalGroupLabel>
      <div style={{ padding: '0 0 16px' }}>
        {deadline ? (
          <div className="flex items-center" style={{ gap: 8 }}>
            <div className="flex-1">
              <AppDatePicker value={deadline} onChange={onChangeDeadline} />
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
              onClick={() => onChangeDeadline('')}
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
            onClick={() => onChangeDeadline(formatAPIDate(new Date()))}
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
    </>
  )
}
