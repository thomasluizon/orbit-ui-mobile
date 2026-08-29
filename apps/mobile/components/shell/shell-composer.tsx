import { useTranslation } from 'react-i18next'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useOffline } from '@/hooks/use-offline'
import { Composer } from './composer'

export function ShellComposer({
  onOpenConversation,
}: Readonly<{
  onOpenConversation: () => void
}>) {
  const { t } = useTranslation()
  const { isOnline } = useOffline()
  const { composerProps } = useChatComposer({
    isOnline,
    offlineTitle: t('chat.offline.title'),
    onOpenConversation,
  })

  return <Composer {...composerProps} />
}
