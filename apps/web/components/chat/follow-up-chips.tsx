'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { getChatFollowUps } from '@orbit/shared/chat'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { ActionRow } from '@/components/ui/action-row'
import { Button } from '@/components/ui/pill-button'
import { AstraGlyph } from '@/components/ui/astra-glyph'

export function FollowUpChips({ followUps, followUpContext, onSelect }: Readonly<{
  followUps: readonly string[]
  followUpContext?: ChatMessage['followUpContext']
  onSelect: (text: string) => void
}>) {
  const t = useTranslations()
  const selected = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  const chips = getChatFollowUps({ followUps: [...followUps], followUpContext })
  if (!chips.length) return null
  return <div aria-label={t('chat.followUps.label')} role="group" className="flex w-full min-w-0 gap-2 overflow-x-auto py-2">
    <ActionRow layout="scroll">{chips.map(item => <Button key={item.question} size="sm" variant="ghost" minimumHeight={TOUCH_TARGET_MIN} retainLeadingIcon
      leadingIcon={<AstraGlyph size={16} />} accessibleName={`${item.label}, ${t('nav.astra')}`}
      disabled={submitted} onClick={() => {
        if (selected.current) return
        selected.current = true
        setSubmitted(true)
        onSelect(item.question)
      }}>{`${item.label} ${t('nav.astra')}`}</Button>)}
    </ActionRow>
  </div>
}
