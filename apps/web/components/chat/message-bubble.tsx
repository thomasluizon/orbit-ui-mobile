'use client'

import { ConversationReveal } from '@/components/chat/conversation-motion'

import { SPACING } from '@orbit/shared/theme'
import { useState } from 'react'
import { ArrowUpRight } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import type { MessageBubbleProps } from '@orbit/shared/chat'
import { getMessageBubbleView, getMessageBubbleOperations } from '@orbit/shared/chat'

import { useChatStore } from '@/stores/chat-store'
import { LocalImage } from '@/components/ui/local-image'
import { Markdown } from '@/components/ui/markdown'
import { ActionChips } from './action-chips'
import { BreakdownSuggestion } from './breakdown-suggestion'
import { ClarificationCard } from './clarification-card'
import { PendingOperationCard } from './pending-operation-card'
import { OperationOutcomes } from './operation-outcomes'
import { ChatBlock } from './block-registry'

export function MessageBubble(props: Readonly<MessageBubbleProps & { senderLabelId?: string }>) {
  const { message, blockAnswerInteraction, animateEntry, onBreakdownConfirmed, onActionChipClick, senderLabelId } = props
  const t = useTranslations()
  const navigate = useChatNavigation()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())
  const { isUser, parts, showUnreadableReply, showOperationUpdate, relatedSurfaces, nonSuggestionActions, suggestions, outcomes } = getMessageBubbleView(props, dismissedBreakdowns)
  const operations = getMessageBubbleOperations(props, useChatStore.getState().transitionMessage)
  const operationOffset = message.parts != null ? 0 : parts.length
  const operationCount = suggestions.length + operations.clarifications.length + operations.pendingOperations.length + (outcomes.length > 0 ? 1 : 0)
  const proseOffset = message.parts != null ? operationCount : 0
  function dismissBreakdown(key: string) {
    setDismissedBreakdowns(previous => new Set([...previous, key]))
  }


  const operationContent = <>
        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

        {!isUser && suggestions.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {suggestions.map(({ key, ...suggestion }, index) => <ConversationReveal key={key} animate={animateEntry} index={operationOffset + index}><BreakdownSuggestion {...suggestion}
              onConfirmed={() => onBreakdownConfirmed?.()} onCancelled={() => dismissBreakdown(key)} /></ConversationReveal>)}
          </div>
        )}

        {!isUser && operations.clarifications.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {operations.clarifications.map(({ key, ...clarification }, index) => <ConversationReveal key={key} animate={animateEntry} index={operationOffset + suggestions.length + index}><ClarificationCard {...clarification} /></ConversationReveal>)}
          </div>
        )}

        {!isUser && operations.pendingOperations.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {operations.pendingOperations.map(({ key, ...operation }, index) => <ConversationReveal key={key} animate={animateEntry} index={operationOffset + suggestions.length + operations.clarifications.length + index}><PendingOperationCard {...operation} onSendMessage={props.onSendMessage} interaction={blockAnswerInteraction} /></ConversationReveal>)}
          </div>
        )}

        {!isUser && outcomes.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            <ConversationReveal animate={animateEntry} index={operationOffset + operationCount - 1} className="flex w-full flex-col gap-4"><OperationOutcomes outcomes={outcomes} /></ConversationReveal>
          </div>
        )}
  </>

  return (
    <ConversationReveal animate={isUser && animateEntry}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={
          isUser
            ? 'max-w-[80%] flex flex-col items-end'
            : 'flex-1 min-w-0 flex flex-col gap-4'
        }
      >
        <span id={senderLabelId} className="sr-only">
          {isUser ? t('chat.senderYou') : t('chat.senderOrbit')}
        </span>

        {message.parts != null ? operationContent : null}
        {showOperationUpdate ? <p className="text-sm text-[var(--fg-2)]">{t('chat.operationUpdated')}</p> : null}
        {showUnreadableReply ? <p className="text-sm text-[var(--fg-2)]">{t('chat.unreadableReply')}</p> : null}
        {parts.map(part => {
          if (part.type === 'block') return <ConversationReveal key={part.key} animate={animateEntry} index={proseOffset + part.key}><ChatBlock part={part.part} message={message} savedAnswers={message.blockAnswers} interaction={blockAnswerInteraction} onSendMessage={props.onSendMessage} expired={part.expired} onActionChipClick={onActionChipClick} /></ConversationReveal>
          const prose = <div key={part.key}
            data-bubble-role={isUser ? 'user' : 'ai'}
            className={isUser
              ? 'select-text inline-block max-w-full bg-[var(--bg-well)] text-[var(--fg-1)]'
              : 'select-text inline-block max-w-full md:max-w-[65ch] text-[var(--fg-1)]'}
            style={{ padding: isUser ? "var(--orbit-space-12) var(--orbit-space-16)" : SPACING.s0, borderRadius: isUser ? 16 : 0 }}
          >
            {part.showImage && message.imageUrl && <LocalImage
              src={message.imageUrl}
              alt={t('chat.attachmentPreview')}
              loading="lazy"
              className="rounded-[12px] w-[200px] max-w-full h-48 object-cover mb-2"
              style={{ border: '1px solid var(--hairline)' }}
            />}
            <Markdown copyableBlocks={!isUser} className="thread-prose" content={part.text} />
          </div>
          return isUser ? prose : <ConversationReveal key={part.key} animate={animateEntry} index={proseOffset + part.key}>{prose}</ConversationReveal>
        })}

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="w-full" role="group" aria-label={t('chat.related.title')}>
            <div className="flex flex-wrap gap-2">
              {relatedSurfaces.map((surface) => (
                <button
                  key={surface.id}
                  type="button"
                  onClick={() => navigate(surface.webRoute)}
                  className="chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60"
                >
                  {t(surface.labelKey)}
                  <ArrowUpRight size={16} strokeWidth={1.8} color="var(--fg-3)" />
                </button>
              ))}
            </div>
          </div>
        )}

        {message.parts == null ? operationContent : null}

      </div>
    </ConversationReveal>
  )
}
