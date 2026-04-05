'use client'

import { useState, useMemo } from 'react'
import { Sparkles, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { formatChatMessage } from './format-chat-message'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
  onBreakdownConfirmed?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageBubble({ message, onBreakdownConfirmed }: Readonly<MessageBubbleProps>) {
  const t = useTranslations()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())

  const suggestionActions = useMemo(
    () =>
      message.actions?.filter(
        (a) => a.status === 'Suggestion' && a.suggestedSubHabits?.length,
      ) ?? [],
    [message.actions],
  )

  const nonSuggestionActions = useMemo(
    () => message.actions?.filter((a) => a.status !== 'Suggestion') ?? [],
    [message.actions],
  )

  function dismissBreakdown(key: string) {
    setDismissedBreakdowns((prev) => new Set([...prev, key]))
  }

  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI avatar */}
      {!isUser && (
        <div className="shrink-0 size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center self-end">
          <Sparkles className="size-5 text-primary" />
        </div>
      )}

      <div
        className={`max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
      >
        {/* Sender label */}
        <span className="text-[11px] font-medium text-text-secondary mb-1 px-2">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        <div
          className={`px-4 py-3 text-sm ${
            isUser
              ? 'bg-linear-to-br from-primary to-primary/80 text-white rounded-2xl rounded-br-md shadow-[var(--shadow-sm)]'
              : 'bg-surface-elevated text-text-primary rounded-2xl rounded-bl-md shadow-[var(--shadow-sm)]'
          }`}
        >
          {/* User-attached image */}
          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              className="rounded-xl max-h-48 mb-2"
            />
          )}
          <p
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: formatChatMessage(message.content ?? ''),
            }}
          />
        </div>

        {/* Action chips for AI messages */}
        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} />
        )}

        {/* Breakdown suggestions */}
        {!isUser && suggestionActions.length > 0 && (
          <div className="space-y-3 mt-3 w-full">
            {suggestionActions.map((action) => {
              const actionKey = action.entityId ?? action.entityName ?? 'suggestion'
              return !dismissedBreakdowns.has(actionKey) ? (
                <BreakdownSuggestion
                  key={actionKey}
                  parentName={action.entityName || 'Habit'}
                  subHabits={action.suggestedSubHabits ?? []}
                  onConfirmed={() => onBreakdownConfirmed?.()}
                  onCancelled={() => dismissBreakdown(actionKey)}
                />
              ) : null
            })}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="shrink-0 size-10 rounded-full border-2 border-primary/20 bg-surface-elevated flex items-center justify-center self-end">
          <User className="size-5 text-text-secondary" />
        </div>
      )}
    </div>
  )
}
