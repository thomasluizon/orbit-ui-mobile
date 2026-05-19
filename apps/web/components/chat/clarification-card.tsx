'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ClarificationRequest } from '@orbit/shared/types'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { safeT } from '@/lib/i18n'

interface ClarificationCardProps {
  clarificationRequest: ClarificationRequest
  entityName?: string | null
}

type IntlKey = Parameters<ReturnType<typeof useTranslations>>[0]

export function ClarificationCard({
  clarificationRequest,
  entityName,
}: Readonly<ClarificationCardProps>) {
  const t = useTranslations()
  const resolve = useResolveClarification()

  const [activeValue, setActiveValue] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  // Error keys are statically-known i18n catalog entries, but typing as string keeps
  // the setter calls clean (no `as IntlKey` cast at every assignment). The cast
  // moves to the single render call where t() is invoked.
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

      // HTTP succeeded but the tool may still have been Denied/Failed/PendingConfirmation.
      // Only flip to the success state when the operation actually executed.
      if (result.data.operation.status !== 'Succeeded') {
        setErrorKey('habits.clarification.errorGeneric')
        return
      }

      setResolved(true)
      setResolvedLabel(label)
    } catch {
      // mutateAsync can throw on unmount, abort, or unexpected runtime errors.
      // Always clear the active state below so the button doesn't get stuck disabled.
      setErrorKey('habits.clarification.errorGeneric')
    } finally {
      setActiveValue(null)
    }
  }

  if (resolved) {
    return (
      <div className="bg-surface-elevated/50 border border-border-muted rounded-[var(--radius-xl)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2 py-1">
          <div className="size-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="size-3.5 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-emerald-400">
            {t('habits.clarification.successCreated', { name: entityName ?? resolvedLabel ?? '' })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-elevated/50 border border-border-muted rounded-[var(--radius-xl)] p-4 space-y-3 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-text-primary">
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
              onClick={() => handleSelect(label, action.value)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-primary/10 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isActive && <Loader2 className="size-3 animate-spin" />}
              {label}
            </button>
          )
        })}
      </div>

      {errorKey && <p className="text-xs text-red-400">{t(errorKey as IntlKey)}</p>}
    </div>
  )
}

function mapStatusToErrorKey(status: number): string {
  if (status === 404) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}
