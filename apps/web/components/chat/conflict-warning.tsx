'use client'

import { AlertTriangle } from '@/components/ui/icons'
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
        className: 'bg-[var(--status-overdue)]/10 text-[var(--status-overdue-text)]',
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
      className={`mt-2 flex flex-col gap-2 rounded-[16px] px-4 py-3 text-xs ${severity.className}`}
      style={{ boxShadow: `inset 0 0 0 1px ${severity.ring}` }}
    >
      <p className="flex items-center gap-1 font-semibold">
        <AlertTriangle className="size-3.5 shrink-0" />
        {t('chat.conflict.title')}
      </p>
      {warning.conflictingHabits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {warning.conflictingHabits.map((habit) => (
            <li key={habit.habitId} className="min-w-0 [text-wrap:pretty]">
              <span className="font-medium">{habit.habitTitle}</span>:{' '}
              {habit.conflictDescription}
            </li>
          ))}
        </ul>
      )}
      {warning.recommendation && (
        <p className="[text-wrap:pretty]">{warning.recommendation}</p>
      )}
    </div>
  )
}
