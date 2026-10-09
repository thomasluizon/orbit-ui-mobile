'use client'

import { ChatCardOperationContext } from '@/hooks/use-chat-card-operation'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { chatTraceLabelKey, stripChatDirectives } from '@orbit/shared/chat'
import { APP_BAR_CONTROL_CLASS, AppBar } from '@/components/ui/app-bar'
import type { useChatComposer } from '@/hooks/use-chat-composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { ChevronDown, X } from '@/components/ui/icons'
import { WorkingMark } from '@/components/ui/toast'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'
import { ChatEmptyState } from './chat-empty-state'
import { FollowUpChips } from './follow-up-chips'

function ThinkingTrace({ steps, running }: Readonly<{
  steps: readonly { domain: string; access: string }[]
  running: boolean
}>) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  if (steps.length === 0) return null
  const lines = steps.map((step, index) => <div key={`${step.domain}-${step.access}-${index}`} className="flex items-center gap-2 text-sm text-[var(--fg-3)]">
    <span>{t(chatTraceLabelKey(step.domain, step.access))}</span>
    {running && index === steps.length - 1 ? <WorkingMark /> : null}
  </div>)
  if (running) return <div className="flex flex-col gap-1 py-2" aria-live="off">{lines}</div>
  return <div className="py-2">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)} className="flex min-h-[var(--touch-min)] items-center gap-2 text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)] focus-visible:outline-2 focus-visible:outline-[var(--fg-1)]">
      {t('chat.trace.steps', { count: steps.length })}
      <ChevronDown aria-hidden="true" size={16} strokeWidth={1.5} className={expanded ? 'rotate-180' : undefined} />
    </button>
    <div id={panelId} hidden={!expanded} className="flex flex-col gap-1" aria-live="off">{lines}</div>
  </div>
}

type ChatController = Omit<
  ReturnType<typeof useChatComposer>,
  'fileInputRef' | 'textFileInputRef' | 'handleFileSelect' | 'handleTextFileSelect'
>

function TurnAnnouncement({ content, complete, messageId, claimAnnouncement }: Readonly<{
  content: string
  complete: boolean
  messageId: string
  claimAnnouncement: (messageId: string) => boolean
}>) {
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (!complete || !content) return
    let mounted = true
    void Promise.resolve().then(() => {
      if (!mounted || !claimAnnouncement(messageId)) return
      setAnnouncement(stripChatDirectives(content))
    })
    return () => { mounted = false }
  }, [complete, content, messageId, claimAnnouncement])
  return <span aria-live="polite" className="sr-only">{announcement}</span>
}

function moveBetweenTurns(event: KeyboardEvent, feed: HTMLDivElement | null) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  if (event.key !== 'PageDown' && event.key !== 'PageUp') return
  const target = event.target
  if (!(target instanceof Element)) return
  const article = target.closest('article')
  if (!article || !feed?.contains(article)) return
  const next = event.key === 'PageDown' ? article.nextElementSibling : article.previousElementSibling
  if (next instanceof HTMLElement && next.tagName === 'ARTICLE') {
    event.preventDefault()
    next.focus()
  }
}

export function AstraConversation({ chat, notice }: Readonly<{ chat: ChatController; notice?: ReactNode }>) {
  const t = useTranslations()
  const router = useRouter()
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const close = useCallback(() => setAstraConversationOpen(false), [setAstraConversationOpen])
  const {
    chatContainerRef,
    threadScroll,
    scrollToBottom,
    trackCardOperation: trackOperation,
    messages,
    isTyping,
    streamingMessageId,
    showSuggestions,
    sendMessage,
    activeSteps,
    canShowFollowUps,
    handleBreakdownConfirmed,
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    isPendingOperationBusy = false,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    composerProps,
  } = chat
  const threadContentRef = useRef<HTMLDivElement>(null)
  const registerChatContainer = useCallback((element: HTMLDivElement | null) => {
    chatContainerRef.current = element
    if (!element) return
    threadScroll.followLatest()
    if (!element.querySelector('article')) return
    element.scrollTo({ top: element.scrollHeight, behavior: 'auto' })
    threadScroll.recordScroll(element.scrollTop, element.scrollHeight - element.clientHeight)
  }, [chatContainerRef, threadScroll])

  useEffect(() => {
    const feed = chatContainerRef.current
    const content = threadContentRef.current
    if (!feed || !content) return
    const observer = new ResizeObserver(() => {
      if (threadScroll.isFollowing() && feed.querySelector('article')) scrollToBottom()
    })
    observer.observe(feed)
    observer.observe(content)
    return () => observer.disconnect()
  }, [chatContainerRef, scrollToBottom, threadScroll])

  const trackCardOperation: ChatController['trackCardOperation'] = useCallback((operation) => {
    threadScroll.followLatest()
    return trackOperation(operation)
  }, [trackOperation, threadScroll])

  const senderIdPrefix = useId()
  const announcedMessageIds = useRef(new Set<string>())
  const claimAnnouncement = useCallback((messageId: string) => {
    if (announcedMessageIds.current.has(messageId)) return false
    announcedMessageIds.current.add(messageId)
    return true
  }, [])

  const [initialMessageIds] = useAccountScopedState(() => new Set(messages.map((message) => message.id)))
  const [initialStreamingMessageId] = useAccountScopedState(() => streamingMessageId)

  const [selectedGoalId, setSelectedGoalId] = useAccountScopedState<string | null>(null)

  const handleActionChipClick = useCallback((entityId: string, actionType: string) => {
    if (CHAT_GOAL_ACTION_TYPES.has(actionType)) {
      setSelectedGoalId(entityId)
      return
    }

    setSelectedGoalId(null)
    close()
    router.push(`/habits/${entityId}`)
  }, [close, router, setSelectedGoalId])

  const handleLinkedHabitNavigate = useCallback((habitId: string) => {
    setSelectedGoalId(null)
    close()
    router.push(`/habits/${habitId}`)
  }, [close, router, setSelectedGoalId])

  const handleGoalDrawerOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedGoalId(null)
  }, [setSelectedGoalId])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      moveBetweenTurns(event, chatContainerRef.current)
      if (event.key !== 'Escape' || event.defaultPrevented) return

      const target = event.target
      if (target instanceof HTMLTextAreaElement && target.value.trim().length > 0) {
        return
      }

      if (target instanceof HTMLInputElement && target.value.trim().length > 0) {
        return
      }

      if (target instanceof HTMLElement && target.isContentEditable && target.textContent.trim()) {
        return
      }

      close()
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [chatContainerRef, close])

  return (
    <ChatCardOperationContext.Provider value={trackCardOperation}>
    <div className="relative flex h-full flex-col">
      <div className="relative z-10 shrink-0">
        <AppBar
          title={t('chat.title')}
          titleIsBrandName
          action={
            <button
              type="button"
              aria-label={t('common.closeConversation')}
              onClick={close}
              className={APP_BAR_CONTROL_CLASS}
            >
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />
      </div>
      <span role="status" aria-live="polite" className="sr-only">{activeSteps.length > 0 ? t('chat.trace.working') : ''}</span>

      <div
        ref={registerChatContainer}
        onScroll={(event) => {
          const feed = event.currentTarget
          threadScroll.recordScroll(feed.scrollTop, feed.scrollHeight - feed.clientHeight)
        }}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ padding: 16 }}
        role="feed"
        aria-busy={isTyping || streamingMessageId !== null || activeSteps.length > 0 || isPendingOperationBusy}
        aria-label={t('chat.title')}
      >
        {showSuggestions && <ChatEmptyState />}

        <div ref={threadContentRef} className="flex flex-col gap-4">
        {messages.map((msg, index) => (
          <article
            key={msg.id}
            tabIndex={-1}
            aria-labelledby={`${senderIdPrefix}-${msg.id}`}
            aria-posinset={index + 1}
            aria-setsize={messages.length}
            className="flex min-w-0 flex-col gap-[16px]"
          >
          {msg.role === 'ai' ? <TurnAnnouncement messageId={msg.id} claimAnnouncement={claimAnnouncement} content={msg.content} complete={(!initialMessageIds.has(msg.id) || msg.id === initialStreamingMessageId) && msg.id !== streamingMessageId && !isTyping} /> : null}
          <MessageBubble
            senderLabelId={`${senderIdPrefix}-${msg.id}`}
            message={msg}
            animateEntry={!initialMessageIds.has(msg.id)}
            isStreaming={msg.id === streamingMessageId}
            onBreakdownConfirmed={handleBreakdownConfirmed}
            onActionChipClick={handleActionChipClick}
            onPendingOperationRevise={revisePendingOperationForBubble}
            onPendingOperationRefresh={refreshPendingOperationForBubble}
            onPendingOperationConfirmExecute={confirmAndExecutePendingOperation}
            onPendingOperationPrepareStepUp={prepareStepUpForBubble}
            onPendingOperationVerifyStepUp={verifyStepUpForBubble}
          />
          {msg.toolSteps?.length ? <ThinkingTrace steps={msg.toolSteps} running={false} /> : null}
          {msg.role === 'ai' && msg.id === messages.at(-1)?.id && canShowFollowUps && msg.followUps ? <FollowUpChips followUps={msg.followUps} onSelect={(text) => void sendMessage(text, 'followUp')} /> : null}
          </article>
        ))}
        {activeSteps.length > 0 ? <ThinkingTrace steps={activeSteps} running /> : null}
        </div>

      </div>

      <div className="shrink-0">
        {notice !== undefined ? <div data-shell-notice="">{notice}</div> : null}
        <Composer {...composerProps} autoFocus suggestions={composerProps.suggestions} />
      </div>

      {selectedGoalId && (
        <GoalDetailDrawer
          open={!!selectedGoalId}
          onOpenChange={handleGoalDrawerOpenChange}
          onLinkedHabitNavigate={handleLinkedHabitNavigate}
          goalId={selectedGoalId}
        />
      )}
    </div>
    </ChatCardOperationContext.Provider>
  )
}
