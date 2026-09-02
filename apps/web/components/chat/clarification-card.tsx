'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ClarificationRequest } from '@orbit/shared/types'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { safeT } from '@/lib/i18n'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

export function ClarificationCard({ clarificationRequest, entityName }: Readonly<{ clarificationRequest: ClarificationRequest; entityName?: string | null }>) {
  const t = useTranslations()
  const resolve = useResolveClarification()
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const choose = async (label: string, value: string) => {
    setErrorKey(null)
    try {
      const result = await resolve.mutateAsync({ operationId: clarificationRequest.operationId, value })
      if (!result.ok) setErrorKey(errorKeyForStatus(result.status))
      else if (result.data.operation.status !== 'Succeeded') setErrorKey('habits.clarification.errorGeneric')
      else setResolvedLabel(label)
    } catch {
      setErrorKey('habits.clarification.errorGeneric')
    }
  }
  return (
    <BlockFrame state={resolve.isPending ? 'acting' : 'resting'} title={safeT(t, clarificationRequest.question)} items={[]} actions={(
      <div className="flex flex-col items-start gap-3">
        {resolvedLabel ? <p role="status" className="text-sm text-[var(--fg-2)]">{t('habits.clarification.successCreated', { name: entityName ?? resolvedLabel })}</p> : (
          <div className="flex flex-wrap gap-2">{clarificationRequest.quickActions.map((action) => {
            const label = safeT(t, action.label)
            return <Button key={action.value} variant="ghost" size="sm" disabled={resolve.isPending} onClick={() => void choose(label, action.value)}>{label}</Button>
          })}</div>
        )}
        {errorKey ? <p role="alert" className="text-sm text-[var(--status-bad)]">{t(errorKey)}</p> : null}
      </div>
    )} />
  )
}

function errorKeyForStatus(status: number): string {
  if (status === 404 || status === 410) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}
