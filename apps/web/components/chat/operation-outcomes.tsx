'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { AgentOperationOutcome } from '@orbit/shared/utils'
import {
  getAgentOperationLabelKey,
  getAgentPolicyReasonKey,
} from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

function localName(source: string, target: string | null | undefined, t: ReturnType<typeof useTranslations>): string {
  if (target) return target
  const key = getAgentOperationLabelKey(source)
  return key ? t(key) : t('chat.operation.unknown')
}

export function OperationOutcomes({ outcomes }: Readonly<{ outcomes: readonly AgentOperationOutcome[] }>) {
  const t = useTranslations()
  const router = useRouter()
  return <>{outcomes.map((outcome) => {
    const failed = outcome.status === 'Failed'
    const policy = outcome.status === 'UnsupportedByPolicy'
    const destructive = outcome.riskClass === 'Destructive'
    return <BlockFrame key={outcome.id} state={failed ? 'partiallyFailed' : 'resting'} title={t(`chat.operation.outcome.${outcome.status}`)} items={[{
      id: outcome.id,
      label: localName(outcome.source, outcome.target, t),
      meta: t(getAgentPolicyReasonKey(outcome.policyReason) ?? `chat.operation.status.${outcome.status}`),
      status: failed ? 'failed' : undefined,
      irreversible: destructive,
    }]} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.operation.confirmNote')} actions={policy ? <Button size="sm" variant="ghost" onClick={() => router.push('/profile')}>{t('chat.operation.openProfile')}</Button> : undefined} />
  })}</>
}
