import { z } from 'zod'
import { chatMessageSchema } from '@orbit/shared/types/chat'
import type { ChatStoreState } from '@orbit/shared/stores'
import { desktopChatCheckpointKey, forgetDesktopChatCheckpoint } from './web-reload-state'

const checkpointSchema = z.object({
  accountId: z.string(),
  expiresAt: z.number(),
  conversationOpen: z.boolean(),
  chat: z.object({
    messages: z.array(chatMessageSchema.extend({ timestamp: z.coerce.date() })),
    draft: z.string(),
    proactiveEntryId: z.string().nullable(),
    proactiveOutcomes: z.record(z.string(), z.enum(['opened', 'acted'])),
    contextualSuggestion: z.object({ id: z.string(), label: z.string(), prompt: z.string() }).nullable(),
  }),
})

async function durableImageUrl(url: string | null | undefined) {
  if (!url?.startsWith('blob:')) return url
  const response = await fetch(url)
  if (!response.ok) throw new Error('Cannot retain conversation image across web release')
  const blob = new Blob([await response.arrayBuffer()], { type: response.headers.get('Content-Type') ?? '' })
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read conversation image'))
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Cannot encode conversation image'))
    reader.readAsDataURL(blob)
  })
}

export async function writeDesktopChatCheckpoint(accountId: string, chat: ChatStoreState, conversationOpen: boolean) {
  const messages = await Promise.all(chat.messages.map(async message => ({
    ...message, imageUrl: await durableImageUrl(message.imageUrl),
  })))
  const checkpoint = { accountId, expiresAt: Date.now() + 5 * 60_000, conversationOpen,
    chat: { messages, draft: chat.draft, proactiveEntryId: chat.proactiveEntryId,
      proactiveOutcomes: chat.proactiveOutcomes, contextualSuggestion: chat.contextualSuggestion } }
  checkpointSchema.parse(checkpoint)
  sessionStorage.setItem(desktopChatCheckpointKey, JSON.stringify(checkpoint))
}

export function takeDesktopChatCheckpoint(accountId: string) {
  const stored = sessionStorage.getItem(desktopChatCheckpointKey)
  forgetDesktopChatCheckpoint()
  if (!stored) return null
  let parsed: unknown
  try { parsed = JSON.parse(stored) } catch { return null }
  const checkpoint = checkpointSchema.safeParse(parsed)
  return checkpoint.success && checkpoint.data.accountId === accountId && checkpoint.data.expiresAt > Date.now()
    ? checkpoint.data : null
}
