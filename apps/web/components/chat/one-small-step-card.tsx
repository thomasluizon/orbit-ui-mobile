'use client'

import { useState } from 'react'
import { createUseOneSmallStepActions, type AnswerBlockProps, type SendOneSmallStepMessage } from '@orbit/shared/chat'
import type { OneSmallStepCard as StartingStepCard } from '@orbit/shared/contracts/blocks'
import { SMALL_PILL_VISIBLE_MIN, typeRoles } from '@orbit/shared/theme'
import { BlockFrame } from '@/components/ui/block-frame'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PillButton } from '@/components/ui/pill-button'
import { AstraGlyph } from '@/components/ui/astra-glyph'

const useOneSmallStepActions = createUseOneSmallStepActions({ useState })

export function OneSmallStepCard({ card, onSendMessage, interaction }: Readonly<{
  card: StartingStepCard
  onSendMessage?: SendOneSmallStepMessage
  interaction?: AnswerBlockProps['interaction']
}>) {
  const actions = useOneSmallStepActions(onSendMessage, interaction)
  return <BlockFrame title={card.suggestion.goal} titleMode="typed" count={null} state={actions.sending ? 'acting' : 'resting'} items={[]}
    body={<PersonalTextDetails outset textStyle={{ fontSize: typeRoles.h2.size, fontWeight: typeRoles.h2.weight, lineHeight: typeRoles.h2.lineHeight, letterSpacing: `${typeRoles.h2.letterSpacingEm}em`, color: 'var(--fg-1)' }}>{card.suggestion.step}</PersonalTextDetails>}
    actions={card.actions.map(action => <PillButton key={action.id} size="sm" variant="ghost" minimumHeight={SMALL_PILL_VISIBLE_MIN} retainLeadingIcon leadingIcon={<AstraGlyph size={16} />} accessibleName={action.label} disabled={actions.disabled} onClick={() => void actions.submit(action)}>{action.label}</PillButton>)} />
}
