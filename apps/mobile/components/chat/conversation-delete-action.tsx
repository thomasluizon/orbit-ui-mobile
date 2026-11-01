import { useTranslation } from 'react-i18next'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { Trash2 } from '@/components/ui/icons'
import { useChatStore } from '@/stores/chat-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { createStyles } from './conversation.styles'

export function ConversationDeleteAction({ onDelete, isSending, operationBusy }: Readonly<{ onDelete: () => void; isSending: boolean; operationBusy: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const id = useChatStore(state => state.serverConversationId)
  const busy = useChatStore(state => state.conversationBusy || state.queuedPrompts.length > 0)
  return id ? <MotionPressable accessibilityRole="button" accessibilityLabel={t('chat.conversation.delete')} disabled={busy || isSending || operationBusy} onPress={onDelete} style={({ pressed }) => [styles.headerClose, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}><Trash2 size={20} strokeWidth={2} color={tokens.fg1} /></MotionPressable> : null
}
