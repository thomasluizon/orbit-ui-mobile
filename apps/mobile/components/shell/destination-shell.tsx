import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isPrimaryShellDestination, resolveShellDestination } from '@orbit/shared/utils'
import { ChatScreenContent } from '@/app/chat'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useOffline } from '@/hooks/use-offline'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Shell412 } from './shell-412'
import { ShellComposer } from './shell-composer'

type DestinationShellProps = {
  children: ReactNode
  pathname: string
  notice?: ReactNode
} & (
  | {
      nav?: true
      tabBar: ReactNode
      fab?: ReactNode
    }
  | {
      nav: false
      tabBar?: never
      fab?: never
    }
)

export function DestinationShell(props: Readonly<DestinationShellProps>) {
  const { t } = useTranslation()
  const navigationEnabled = props.nav !== false
  const primaryDestination = navigationEnabled && isPrimaryShellDestination(props.pathname)
  const [conversationPathname, setConversationPathname] = useState<string | null>(null)
  const conversationOpen = conversationPathname !== null
  const conversationOnCurrentDestination =
    primaryDestination && conversationPathname === props.pathname
  const { sheetRef, closeSheet } = useSheetHost()

  const closeConversation = useCallback(() => {
    closeSheet(() => setConversationPathname(null))
  }, [closeSheet])
  const openConversation = useCallback(
    () => setConversationPathname(props.pathname),
    [props.pathname],
  )
  const { isOnline } = useOffline()
  const composer = useChatComposer({
    isOnline,
    destination: primaryDestination
      ? resolveShellDestination(props.pathname) ?? undefined
      : undefined,
    onOpenConversation: openConversation,
  })

  useEffect(() => {
    if (conversationOpen && !conversationOnCurrentDestination) closeConversation()
  }, [closeConversation, conversationOnCurrentDestination, conversationOpen])

  const conversation = conversationOpen ? (
    <Sheet
      ref={sheetRef}
      open
      onClose={() => setConversationPathname(null)}
      presentation="conversation"
    >
      <ChatScreenContent composer={composer} onClose={closeConversation} />
    </Sheet>
  ) : undefined
  const conversationSlots = conversation
    ? {
        conversation,
        conversationLabel: t('chat.title'),
        conversationOpen: true,
      }
    : {}

  if (!navigationEnabled) {
    return (
      <Shell412
        nav={false}
        notice={props.notice}
        {...conversationSlots}
      >
        {props.children}
      </Shell412>
    )
  }

  return (
    <Shell412
      tabBar={props.tabBar}
      fab={props.fab}
      notice={props.notice}
      composer={
        primaryDestination ? (
          <ShellComposer composer={composer} />
        ) : undefined
      }
      {...conversationSlots}
    >
      {props.children}
    </Shell412>
  )
}
