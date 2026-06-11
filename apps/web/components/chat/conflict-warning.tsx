'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'

interface ConflictWarningProps {
  warning: ConflictWarningType
}

function severityStyle(severity: ConflictWarningType['severity']): {
  className: string
  ring: string
} {
  switch (severity) {
    case 'HIGH':
      return {
        className: 'bg-[var(--status-bad)]/10 text-[var(--status-bad)]',
        ring: 'color-mix(in srgb, var(--status-bad) 30%, transparent)',
      }
    case 'MEDIUM':
      return {
        className: 'bg-[var(--status-overdue)]/10 text-[var(--status-overdue)]',
        ring: 'color-mix(in srgb, var(--status-overdue) 30%, transparent)',
      }
    case 'LOW':
      return {
        className: 'bg-[rgba(var(--primary-rgb),0.10)] text-[var(--primary)]',
        ring: 'rgba(var(--primary-rgb), 0.30)',
      }
    default:
      return {
        className: 'bg-[var(--bg-elev)] text-[var(--fg-2)]',
        ring: 'var(--hairline)',
      }
  }
}

export function ConflictWarning({ warning }: Readonly<ConflictWarningProps>) {
  const t = useTranslations()
  const severity = severityStyle(warning.severity)

  return (
    <div
      data-severity={warning.severity}
      className={`rounded-[16px] px-4 py-3 text-xs mt-2 ${severity.className}`}
      style={{ boxShadow: `inset 0 0 0 1px ${severity.ring}` }}
    >
      <p className="font-semibold mb-1 flex items-center gap-1.5">
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
