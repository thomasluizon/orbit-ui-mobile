'use client'

import { useState } from 'react'
import { ArrowUpRight } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [dismissedBreakdowns, setDismissedBreakdowns] = useState<Set<string>>(new Set())
  const { isUser, parts, relatedSurfaces, nonSuggestionActions, suggestions, outcomes } = getMessageBubbleView(props, dismissedBreakdowns)
  const operations = getMessageBubbleOperations(props, useChatStore.getState().transitionMessage)
  function dismissBreakdown(key: string) {
    setDismissedBreakdowns(previous => new Set([...previous, key]))
  }


  return (
    <div
      className={`${animateEntry ? 'animate-msg-in ' : ''}flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 8 }}
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

        {parts.map(part => {
          if (part.type === 'block') return <ChatBlock key={part.key} part={part.part} savedAnswers={message.blockAnswers} interaction={blockAnswerInteraction} expired={part.expired} onActionChipClick={onActionChipClick} />
          return <div
            key={part.key}
            data-bubble-role={isUser ? 'user' : 'ai'}
            className={isUser
              ? 'select-text inline-block max-w-full bg-[var(--bg-well)] text-[var(--fg-1)]'
              : 'select-text inline-block max-w-full md:max-w-[65ch] text-[var(--fg-1)]'}
            style={{ padding: isUser ? '12px 16px' : 0, borderRadius: isUser ? 16 : 0 }}
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
        })}

        {!isUser && relatedSurfaces.length > 0 && (
          <div className="w-full">
            <span
              className="block"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-3)',
                marginBottom: 4,
                paddingLeft: 4,
              }}
            >
              {t('chat.related.title')}
            </span>
            <div className="flex flex-wrap gap-2">
              {relatedSurfaces.map((surface) => (
                <button
                  key={surface.id}
                  type="button"
                  onClick={() => router.push(surface.webRoute)}
                  className="chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60"
                >
                  {t(surface.labelKey)}
                  <ArrowUpRight size={16} strokeWidth={1.8} color="var(--fg-3)" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!isUser && nonSuggestionActions.length > 0 && (
          <ActionChips actions={nonSuggestionActions} onChipClick={onActionChipClick} />
        )}

        {!isUser && suggestions.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {suggestions.map(({ key, ...suggestion }) => <BreakdownSuggestion key={key} {...suggestion}
              onConfirmed={() => onBreakdownConfirmed?.()} onCancelled={() => dismissBreakdown(key)} />)}
          </div>
        )}

        {!isUser && operations.clarifications.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {operations.clarifications.map(({ key, ...clarification }) => <ClarificationCard key={key} {...clarification} />)}
          </div>
        )}

        {!isUser && operations.pendingOperations.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            {operations.pendingOperations.map(({ key, ...operation }) => <PendingOperationCard key={key} {...operation} />)}
          </div>
        )}

        {!isUser && outcomes.length > 0 && (
          <div className="flex w-full flex-col gap-4">
            <OperationOutcomes outcomes={outcomes} />
          </div>
        )}
      </div>
    </div>
  )
}
