'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { AgentOperationResult, AgentPolicyDenial } from '@orbit/shared/types/ai'
import { getAgentOperationLabelKey } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

function localName(source: string, target: string | null | undefined, t: ReturnType<typeof useTranslations>): string {
  if (target) return target
  const key = getAgentOperationLabelKey(source)
  return key ? t(key) : t('chat.operation.unknown')
}

export function OperationOutcomes({ operations, denials }: Readonly<{ operations: readonly AgentOperationResult[]; denials: readonly AgentPolicyDenial[] }>) {
  const t = useTranslations()
  const router = useRouter()
  const outcomes = [
    ...operations.map((operation) => ({
      id: operation.operationId,
      source: operation.sourceName,
      target: operation.targetName,
      riskClass: operation.riskClass,
      status: operation.status,
    })),
    ...denials.map((denial) => ({
      id: denial.operationId,
      source: denial.sourceName,
      target: null,
      riskClass: denial.riskClass,
      status: 'UnsupportedByPolicy' as const,
    })),
  ]
  return <>{outcomes.map((outcome) => {
    const failed = outcome.status === 'Failed'
    const succeeded = outcome.status === 'Succeeded'
    const policy = outcome.status === 'UnsupportedByPolicy'
    const destructive = outcome.riskClass === 'Destructive'
    return <BlockFrame key={outcome.id} state={failed ? 'partiallyFailed' : 'resting'} title={t(`chat.operation.outcome.${outcome.status}`)} items={[{
      id: outcome.id,
      label: localName(outcome.source, outcome.target, t),
      meta: t(`chat.operation.status.${outcome.status}`),
      status: failed ? 'failed' : succeeded ? 'done' : undefined,
      irreversible: destructive && !succeeded,
    }]} risk={<Badge variant="outline">{t(`chat.operation.risk.${outcome.riskClass.toLowerCase()}`)}</Badge>} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.operation.confirmNote')} actions={policy ? <Button size="sm" variant="ghost" onClick={() => router.push('/profile')}>{t('chat.operation.openProfile')}</Button> : undefined} />
  })}</>
}
