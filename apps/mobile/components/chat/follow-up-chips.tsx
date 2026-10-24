import { useRef, useState } from 'react'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { getChatFollowUps } from '@orbit/shared/chat'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { ActionRow } from '@/components/ui/action-row'
import { Button } from '@/components/ui/pill-button'
import { useTranslation } from 'react-i18next'
import { ScrollView } from 'react-native'

export function FollowUpChips({ followUps, followUpContext, onSelect }: Readonly<{
  followUps: readonly string[]
  followUpContext?: ChatMessage['followUpContext']
  onSelect: (text: string) => void
}>) {
  const { t } = useTranslation()
  const selected = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  const chips = getChatFollowUps({ followUps: [...followUps], followUpContext })
  if (!chips.length) return null
  return <ScrollView horizontal style={{ width: '100%' }} showsHorizontalScrollIndicator={false} accessibilityLabel={t('chat.followUps.label')}
    contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.s8, paddingVertical: SPACING.s8, minHeight: TOUCH_TARGET_MIN }}>
    <ActionRow layout="scroll">{chips.map(item => <Button key={item.question} size="sm" variant="ghost" minimumHeight={TOUCH_TARGET_MIN} retainLeadingIcon
      leadingIcon={<AstraGlyph size={16} />} accessibleName={item.label}
      disabled={submitted} onClick={() => {
        if (selected.current) return
        selected.current = true
        setSubmitted(true)
        onSelect(item.question)
      }}>{item.label}</Button>)}
    </ActionRow>
  </ScrollView>
}
