'use client'

import { useTranslations } from 'next-intl'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import type { AgentOperationOutcome } from '@orbit/shared/utils'
import {
  getAgentOperationLabelKey,
  getAgentOperationCopyKeys,
} from '@orbit/shared/utils'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

function localName(source: string, target: string | null | undefined, t: ReturnType<typeof useTranslations>): string {
  if (target) return target
  const key = getAgentOperationLabelKey(source)
  return key ? t(key) : t('chat.operation.unknown')
}

export function OperationOutcomes({ outcomes }: Readonly<{ outcomes: readonly AgentOperationOutcome[] }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
  return <>{outcomes.map((outcome) => {
    const copy = getAgentOperationCopyKeys(outcome)
    const failed = outcome.status === 'Failed'
    const policy = outcome.status === 'UnsupportedByPolicy'
    return <BlockFrame key={outcome.id} state={failed ? 'partiallyFailed' : 'resting'} title={t(copy.titleKey)} items={[{
      id: outcome.id,
      label: outcome.target ? <PersonalTextDetails outset>{outcome.target}</PersonalTextDetails> : localName(outcome.source, outcome.target, t),
      wrapLabel: Boolean(outcome.target),
      meta: t(copy.statusKey),
      status: failed ? 'failed' : undefined,
    }]} actions={policy ? <Button size="sm" variant="ghost" onClick={() => navigate('/profile')}>{t('chat.operation.openProfile')}</Button> : undefined} />
  })}</>
}
