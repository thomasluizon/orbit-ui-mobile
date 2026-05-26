'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'

interface ConflictWarningProps {
  warning: ConflictWarningType
}

function severityStyle(severity: ConflictWarningType['severity']): string {
  switch (severity) {
    case 'HIGH':
      return 'border-[var(--status-bad)]/30 bg-[var(--status-bad)]/10 text-[var(--status-bad)]'
    case 'MEDIUM':
      return 'border-[var(--status-overdue)]/30 bg-[var(--status-overdue)]/10 text-[var(--status-overdue)]'
    case 'LOW':
      return 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]'
    default:
      return 'border-[var(--hairline)] bg-[var(--bg-elev)] text-[var(--fg-2)]'
  }
}

export function ConflictWarning({ warning }: Readonly<ConflictWarningProps>) {
  const t = useTranslations()

  return (
    <div
      data-severity={warning.severity}
      className={`rounded-[var(--radius-lg)] border px-4 py-3 text-xs mt-2 shadow-[var(--shadow-sm)] ${severityStyle(warning.severity)}`}
    >
      <p className="font-bold mb-1 flex items-center gap-1.5">
        <AlertTriangle className="size-3.5" />
        {t('chat.conflict.title')}
      </p>
      {warning.conflictingHabits.length > 0 && (
        <ul className="space-y-0.5 mb-1.5">
          {warning.conflictingHabits.map((habit) => (
            <li key={habit.habitId}>
              <span className="font-semibold">{habit.habitTitle}</span>:{' '}
              {habit.conflictDescription}
            </li>
          ))}
        </ul>
      )}
      {warning.recommendation && (
        <p className="opacity-80 text-[11px]">{warning.recommendation}</p>
      )}
    </div>
  )
}
