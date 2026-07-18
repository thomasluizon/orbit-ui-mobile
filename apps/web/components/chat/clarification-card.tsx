'use client'

import { useState } from 'react'
import { Check, Loader2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { ClarificationRequest } from '@orbit/shared/types'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { safeT } from '@/lib/i18n'

interface ClarificationCardProps {
  clarificationRequest: ClarificationRequest
  entityName?: string | null
}

export function ClarificationCard({
  clarificationRequest,
  entityName,
}: Readonly<ClarificationCardProps>) {
  const t = useTranslations()
  const resolve = useResolveClarification()

  const [activeValue, setActiveValue] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  async function handleSelect(label: string, value: string) {
    if (resolve.isPending || resolved) return
    setActiveValue(value)
    setErrorKey(null)

    try {
      const result = await resolve.mutateAsync({
        operationId: clarificationRequest.operationId,
        value,
      })

      if (!result.ok) {
        setErrorKey(mapStatusToErrorKey(result.status))
        return
      }

      if (result.data.operation.status !== 'Succeeded') {
        setErrorKey('habits.clarification.errorGeneric')
        return
      }

      setResolved(true)
      setResolvedLabel(label)
    } catch {
      setErrorKey('habits.clarification.errorGeneric')
    } finally {
      setActiveValue(null)
    }
  }

  if (resolved) {
    return (
      <div className="rounded-[16px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <div className="flex items-center gap-2 py-1">
          <div className="size-6 rounded-full bg-[var(--status-done)]/20 flex items-center justify-center">
            <Check className="size-3.5 text-[var(--status-done)]" />
          </div>
          <p className="text-sm font-medium text-[var(--status-done)]">
            {t('habits.clarification.successCreated', { name: entityName ?? resolvedLabel ?? '' })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-[16px] bg-[var(--bg-card)] p-4 gap-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--fg-1)',
        }}
      >
        {safeT(t, clarificationRequest.question)}
      </p>

      <div className="flex flex-wrap gap-2">
        {clarificationRequest.quickActions.map((action) => {
          const label = safeT(t, action.label)
          const isActive = activeValue === action.value
          const disabled = resolve.isPending
          return (
            <button
              key={action.value}
              type="button"
              disabled={disabled}
              onClick={() => void handleSelect(label, action.value)}
              className="chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isActive && <Loader2 className="size-3 animate-spin" />}
              {label}
            </button>
          )
        })}
      </div>

      {errorKey && (
        <p className="text-xs text-[var(--status-bad)]" role="alert">
          {t(errorKey)}
        </p>
      )}
    </div>
  )
}

function mapStatusToErrorKey(status: number): string {
  if (status === 404 || status === 410) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}
