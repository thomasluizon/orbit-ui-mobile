import { useTranslation } from 'react-i18next'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import type { AgentOperationOutcome } from '@orbit/shared/utils'
import { getAgentOperationLabelKey, getAgentOperationCopyKeys } from '@orbit/shared/utils'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

export function OperationOutcomes({ outcomes }: Readonly<{ outcomes: readonly AgentOperationOutcome[] }>) {
  const { t } = useTranslation()
  const navigate = useChatNavigation()
  return <>{outcomes.map((outcome) => {
    const copy = getAgentOperationCopyKeys(outcome)
    const failed = outcome.status === 'Failed'
    const policy = outcome.status === 'UnsupportedByPolicy'
    const key = getAgentOperationLabelKey(outcome.source)
    const name = outcome.target ?? (key ? t(key) : t('chat.operation.unknown'))
    return <BlockFrame key={outcome.id} state={failed ? 'partiallyFailed' : 'resting'} title={t(copy.titleKey)} items={[{ id: outcome.id, label: outcome.target ? <PersonalTextDetails outset>{name}</PersonalTextDetails> : name, wrapLabel: Boolean(outcome.target), meta: t(copy.statusKey), status: failed ? 'failed' : undefined }]} actions={policy ? <Button size="sm" variant="ghost" onClick={() => navigate('/profile')}>{t('chat.operation.openProfile')}</Button> : undefined} />
  })}</>
}
