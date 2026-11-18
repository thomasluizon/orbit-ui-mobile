import { getRouteMetadata } from '@/lib/route-metadata'
import { redirect } from 'next/navigation'
import { buildConversationEntryHref } from '@/lib/conversation-entry-query'

export function generateMetadata() {
  return getRouteMetadata('/chat')
}

export default function ChatRedirect() {
  redirect(buildConversationEntryHref('proactive'))
}
