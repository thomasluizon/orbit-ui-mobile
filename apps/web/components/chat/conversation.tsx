'use client'

import { ChatCardOperationContext } from '@/hooks/use-chat-card-operation'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { chatTraceLabelKey, stripChatDirectives, findPromptSlot, preparePromptTemplate } from '@orbit/shared/chat'
import { APP_BAR_CONTROL_CLASS, AppBar } from '@/components/ui/app-bar'
import type { useChatComposer } from '@/hooks/use-chat-composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { ChevronDown, Lightbulb, X } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { WorkingMark } from '@/components/ui/toast'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { Button } from '@/components/ui/pill-button'
import { ListRow } from '@/components/ui/list-row'
import { PromptLibrary } from '@/components/chat/prompt-library'
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
    threadScroll.recordScroll(element.scrollTop, element.scrollHeight - element.clientHeight)
    threadScroll.followLatest(element.scrollTop)
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
    threadScroll.followLatest(chatContainerRef.current?.scrollTop)
    return trackOperation(operation)
  }, [chatContainerRef, trackOperation, threadScroll])

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

  const [libraryOpen, setLibraryOpen] = useAccountScopedState(false)
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number } | undefined>()
  const libraryTrigger = useRef<{ current: HTMLButtonElement | null } | null>(null)
  const returnFocusVersion = useRef(0)
  const browseHeaderRef = useRef<HTMLButtonElement>(null)
  const browseEmptyRef = useRef<HTMLButtonElement>(null)
  const pendingIdea = useChatStore(state => state.contextualSuggestion)
  const disabledReason = chat.isOnline === false ? t('shell.composer.offline.reason')
    : chat.atMessageLimit ? t('shell.composer.limit.reason', { allowance: chat.aiMessagesLimit })
    : chat.isSending ? t('shell.composer.busy.reason') : undefined
  const openLibrary = (trigger: { current: HTMLButtonElement | null }) => { returnFocusVersion.current++; libraryTrigger.current = trigger; setLibraryOpen(true) }
  const returnToConversation = useCallback(() => {
    setLibraryOpen(false)
    const version = ++returnFocusVersion.current
    requestAnimationFrame(() => { if (version === returnFocusVersion.current) (libraryTrigger.current?.current ?? browseHeaderRef.current)?.focus() })
  }, [setLibraryOpen])
  const selectIdea = (id: string, label: string, prompt: string) => {
    if (disabledReason) return
    if (findPromptSlot(prompt)) {
      const selection = preparePromptTemplate(useChatStore.getState(), { id, label, prompt })
      setLibraryOpen(false)
      if (selection) {
        useChatStore.getState().setContextualSuggestion(null)
        setInputSelection(selection)
      } else returnToConversation()
    } else {
      void sendMessage(prompt)
      returnToConversation()
    }
  }


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

      if (libraryOpen) { event.preventDefault(); returnToConversation(); return }

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
  }, [chatContainerRef, close, libraryOpen, returnToConversation])

  return (
    <ChatCardOperationContext.Provider value={trackCardOperation}>
    <div className="relative flex h-full flex-col">
      <div className="isolate flex min-h-0 flex-1 flex-col" inert={libraryOpen} aria-hidden={libraryOpen}>
      <div className="relative z-10 shrink-0">
        <AppBar
          title={t('chat.title')}
          titleVisual={<AstraGlyph size={16} />}
          titleIsBrandName
          action={<>
            <button ref={browseHeaderRef} type="button" aria-label={t('chat.templates.browse')} className={APP_BAR_CONTROL_CLASS} onClick={() => openLibrary(browseHeaderRef)}><Lightbulb size={20} strokeWidth={2} aria-hidden="true" /></button>
            <button
              type="button"
              aria-label={t('common.closeConversation')}
              onClick={close}
              className={APP_BAR_CONTROL_CLASS}
            >
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </>}
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
        {showSuggestions && <ChatEmptyState browseAction={<Button buttonRef={browseEmptyRef} variant="ghost" onClick={() => openLibrary(browseEmptyRef)}>{t('chat.templates.browse')}</Button>} />}

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
        {pendingIdea?.id.startsWith('prompt-library:') ? <div className="px-4">
          {composerProps.value ? <p role="status" className="text-sm text-[var(--fg-3)]">{t('chat.templates.draftKept')}</p> : null}
          <ListRow placement="column" title={pendingIdea.label} textMode="label" chevron={false} disabled={!!composerProps.value || !!disabledReason} onClick={() => selectIdea(pendingIdea.id.replace('prompt-library:', ''), pendingIdea.label, pendingIdea.prompt)} />
        </div> : null}
        <Composer {...composerProps} inputSelection={inputSelection} onChangeValue={value => { setInputSelection(undefined); composerProps.onChangeValue(value) }} autoFocus suggestions={composerProps.suggestions} />
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
      <AnimatePresence initial={false}>{libraryOpen ? <PromptLibrary key="prompt-library" onBack={returnToConversation} onSelect={selectIdea} suggestions={composerProps.suggestions} hasProAccess={chat.hasProAccess} hasGoogleConnection={chat.hasGoogleConnection} disabledReason={disabledReason} /> : null}</AnimatePresence>
    </div>
    </ChatCardOperationContext.Provider>
  )
}
