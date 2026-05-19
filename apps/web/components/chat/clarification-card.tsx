'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ClarificationRequest } from '@orbit/shared/types/chat'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'

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
  const [errorKey, setErrorKey] = useState<IntlKey | null>(null)

  async function handleSelect(label: string, value: string) {
    if (resolve.isPending || resolved) return
    setActiveValue(value)
    setErrorKey(null)

    const result = await resolve.mutateAsync({
      operationId: clarificationRequest.operationId,
      value,
    })

    if (result.ok) {
      setResolved(true)
      setResolvedLabel(label)
      setActiveValue(null)
      return
    }

    setActiveValue(null)
    setErrorKey(
      result.status === 404
        ? ('habits.clarification.errorExpired' as IntlKey)
        : ('habits.clarification.errorGeneric' as IntlKey),
    )
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
        {t(clarificationRequest.question as IntlKey)}
      </p>

      <div className="flex flex-wrap gap-2">
        {clarificationRequest.quickActions.map((action) => {
          const label = t(action.label as IntlKey)
          const isActive = activeValue === action.value
          const disabled = resolve.isPending
          return (
            <button
              key={action.value}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(label, action.value)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-150 hover:bg-primary/10 hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isActive && <Loader2 className="size-3 animate-spin" />}
              {label}
            </button>
          )
        })}
      </div>

      {errorKey && <p className="text-xs text-red-400">{t(errorKey)}</p>}
    </div>
  )
}
