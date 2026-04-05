'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictWarningProps {
  warning: ConflictWarningType
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityStyle(severity: ConflictWarningType['severity']): string {
  switch (severity) {
    case 'HIGH':
      return 'border-red-500/30 bg-red-500/10 text-red-400'
    case 'MEDIUM':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    case 'LOW':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-400'
    default:
      return 'border-border bg-surface text-text-secondary'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictWarning({ warning }: Readonly<ConflictWarningProps>) {
  const t = useTranslations()

  return (
    <div
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
