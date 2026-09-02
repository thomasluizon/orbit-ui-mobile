import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import type { AgentOperationResult, AgentPolicyDenial } from '@orbit/shared/types/ai'
import { coalesceAgentOperationOutcomes, getAgentOperationLabelKey, getAgentPolicyReasonKey } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

export function OperationOutcomes({ operations, denials }: Readonly<{ operations: readonly AgentOperationResult[]; denials: readonly AgentPolicyDenial[] }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const outcomes = coalesceAgentOperationOutcomes(operations, denials)
  return <>{outcomes.map((outcome) => {
    const failed = outcome.status === 'Failed'
    const succeeded = outcome.status === 'Succeeded'
    const policy = outcome.status === 'UnsupportedByPolicy'
    const destructive = outcome.riskClass === 'Destructive'
    const key = getAgentOperationLabelKey(outcome.source)
    const name = outcome.target ?? (key ? t(key) : t('chat.operation.unknown'))
    return <BlockFrame key={outcome.id} state={failed ? 'partiallyFailed' : 'resting'} title={t(`chat.operation.outcome.${outcome.status}`)} items={[{ id: outcome.id, label: name, meta: t(getAgentPolicyReasonKey(outcome.policyReason) ?? `chat.operation.status.${outcome.status}`), status: failed ? 'failed' : succeeded ? 'done' : undefined, irreversible: destructive && !succeeded }]} risk={<Badge variant="outline">{t(`chat.operation.risk.${outcome.riskClass.toLowerCase()}`)}</Badge>} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.operation.confirmNote')} actions={policy ? <Button size="sm" variant="ghost" onClick={() => router.push('/profile')}>{t('chat.operation.openProfile')}</Button> : undefined} />
  })}</>
}
