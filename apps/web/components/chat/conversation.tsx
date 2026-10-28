'use client'

import { ConversationReveal } from './conversation-motion'

import { IconButton } from '@/components/ui/icon-button'

import { SPACING } from '@orbit/shared/theme'

import { ChatCardOperationContext } from '@/hooks/use-chat-card-operation'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslations } from 'next-intl'
import { CHAT_GOAL_ACTION_TYPES } from '@orbit/shared/hooks'
import { getChatCompletionText, resolveConversationSuggestions, chatTraceLabelKey, stripChatDirectives, findPromptSlot, preparePromptTemplate, promptDisabledReason, getChatReplyState } from '@orbit/shared/chat'
import { APP_BAR_CONTROL_CLASS, AppBar } from '@/components/ui/app-bar'
import type { useChatComposer } from '@/hooks/use-chat-composer'
import { MessageBubble } from '@/components/chat/message-bubble'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { Composer } from '@/components/shell/composer'
import { ChevronDown, Lightbulb, X, RefreshCw } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { WorkingMark } from '@/components/ui/toast'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/pill-button'
import { ListRow } from '@/components/ui/list-row'
import { ErrorState } from '@/components/ui/error-state'
import { ChatEmptyState } from './chat-empty-state'
import { ProactiveAction } from './proactive-action'
import { FollowUpChips } from './follow-up-chips'

function PromptLibraryLoadFailure({ onBack, onRetry }: Readonly<{ onBack: () => void; onRetry: () => void }>) {
  const t = useTranslations()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [])
  return <div data-prompt-library="" className="absolute inset-0 z-[1] flex min-h-0 flex-col bg-[var(--bg)]">
    <div data-conversation-header="" className="shrink-0">
      <AppBar title={t('chat.templates.title')} titleVariant="screen" titleRef={headingRef} onBack={onBack} backLabel={t('chat.templates.back')} />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <ErrorState message={t('common.error')} action={<IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
    </div>
  </div>
}

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
  if (running) return <div data-thinking-trace="running" className="flex flex-col gap-1 py-2" aria-live="off">{lines}</div>
  return <div data-thinking-trace="completed" className="py-2">
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

function PendingPromptIdea({ hasDraft, disabledReason, onSelect }: Readonly<{
  hasDraft: boolean
  disabledReason: string | undefined
  onSelect: (id: string, label: string, prompt: string) => void
}>) {
  const t = useTranslations()
  const pendingIdea = useChatStore(state => state.contextualSuggestion)
  if (!pendingIdea?.id.startsWith('prompt-library:')) return null
  return <div data-pending-prompt="" className="mx-auto w-full max-w-[740px] px-4">
    {hasDraft ? <p role="status" className="text-sm text-[var(--fg-3)]">{t('chat.templates.draftKept')}</p> : null}
    <ListRow accessibilityLabel={findPromptSlot(pendingIdea.prompt) ? undefined : pendingIdea.label} icon={findPromptSlot(pendingIdea.prompt) ? undefined : <AstraGlyph size={24} />} placement="column" title={pendingIdea.label} textMode="label" chevron={false} disabled={hasDraft || !!disabledReason} onClick={() => onSelect(pendingIdea.id.replace('prompt-library:', ''), pendingIdea.label, pendingIdea.prompt)} />
  </div>
}

export function AstraConversation({ chat, notice }: Readonly<{ chat: ChatController; notice?: ReactNode }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
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
    blockAnswerInteraction,
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
  const proactiveEntryId = useChatStore((state) => state.proactiveEntryId)
  const threadContentRef = useRef<HTMLDivElement>(null)
  const registerChatContainer = useCallback((element: HTMLDivElement | null) => {
    chatContainerRef.current = element
    if (!element || useChatStore.getState().proactiveEntryId) return
    threadScroll.recordScroll(element.scrollTop, element.scrollHeight - element.clientHeight)
    threadScroll.followLatest(element.scrollTop)
    if (!element.querySelector('article')) return
    element.scrollTo({ top: element.scrollHeight, behavior: 'auto' })
    threadScroll.recordScroll(element.scrollTop, element.scrollHeight - element.clientHeight)
  }, [chatContainerRef, threadScroll])

  useEffect(() => {
    const feed = chatContainerRef.current
    if (!proactiveEntryId || !feed) return
    threadScroll.stopFollowing()
    feed.scrollTo({ top: 0, behavior: 'auto' })
    useChatStore.getState().clearProactiveEntry(proactiveEntryId)
  }, [chatContainerRef, proactiveEntryId, threadScroll])

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

  const [pendingVisible, setPendingVisible] = useState(true)
  const { showPendingReply, replyWorking } = getChatReplyState({ isTyping, streamingMessageId, activeStepCount: activeSteps.length, atMessageLimit: chat.atMessageLimit })
  const [announcingWork, setAnnouncingWork] = useState(false)
  useEffect(() => {
    let mounted = true
    void Promise.resolve().then(() => { if (mounted) setAnnouncingWork(replyWorking) })
    return () => { mounted = false }
  }, [replyWorking])

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
  const [libraryModule, setLibraryModule] = useState<typeof import('./prompt-library') | null>(null)
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false)
  const [libraryLoadAttempt, setLibraryLoadAttempt] = useState(0)
  useEffect(() => {
    if (!libraryOpen || libraryModule) return
    let active = true
    void import('@/components/chat/prompt-library').then(
      module => { if (active) setLibraryModule(module) },
      () => { if (active) setLibraryLoadFailed(true) },
    )
    return () => { active = false }
  }, [libraryOpen, libraryModule, libraryLoadAttempt])
  const PromptLibrary = libraryModule?.PromptLibrary
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number } | undefined>()
  const libraryTrigger = useRef<{ current: HTMLButtonElement | null } | null>(null)
  const returnFocusVersion = useRef(0)
  const browseHeaderRef = useRef<HTMLButtonElement>(null)
  const browseEmptyRef = useRef<HTMLButtonElement>(null)
  const disabledReason = promptDisabledReason(chat, t)
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
    navigate(`/habits/${entityId}`)
  }, [navigate, setSelectedGoalId])

  const handleLinkedHabitNavigate = useCallback((habitId: string) => {
    setSelectedGoalId(null)
    navigate(`/habits/${habitId}`)
  }, [navigate, setSelectedGoalId])

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
      <div data-conversation-header="" className="relative z-10 shrink-0">
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
      <span role="status" aria-live="polite" className="sr-only">{announcingWork ? t('chat.trace.working') : ''}</span>

      <div
        ref={registerChatContainer}
        onScroll={(event) => {
          const feed = event.currentTarget
          threadScroll.recordScroll(feed.scrollTop, feed.scrollHeight - feed.clientHeight)
          setPendingVisible(feed.scrollHeight - feed.clientHeight - feed.scrollTop < 40)
        }}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ padding: SPACING.s16, paddingLeft: 'calc(16px + var(--shell-safe-left, 0px))', paddingRight: 'calc(16px + var(--shell-safe-right, 0px))' }}
        role="feed"
        aria-busy={replyWorking || isPendingOperationBusy}
        aria-label={t('chat.title')}
      >
        {showSuggestions && <div className="mx-auto w-full max-w-[708px]"><ChatEmptyState browseAction={<Button buttonRef={browseEmptyRef} variant="ghost" onClick={() => openLibrary(browseEmptyRef)}>{t('chat.templates.browse')}</Button>} /></div>}

        <div ref={threadContentRef} className="mx-auto flex w-full max-w-[708px] flex-col gap-4">
        {messages.map((msg, index) => (
          <article
            key={msg.id}
            tabIndex={-1}
            aria-labelledby={`${senderIdPrefix}-${msg.id}`}
            aria-posinset={index + 1}
            aria-setsize={messages.length}
            className="flex min-w-0 flex-col gap-2"
          >
          {msg.role === 'ai' && messages[index - 1]?.role !== 'ai' ? <span aria-hidden="true" className="pointer-events-none block size-6 shrink-0 text-[var(--fg-1)]" data-astra-avatar="">
            <AstraGlyph size={24} />
          </span> : null}
          <div className="flex min-w-0 w-full flex-col gap-4">
          {msg.role === 'ai' ? <TurnAnnouncement messageId={msg.id} claimAnnouncement={claimAnnouncement} content={getChatCompletionText(msg, { ready: t('chat.replyReady'), unreadable: t('chat.unreadableReply') })} complete={(!initialMessageIds.has(msg.id) || msg.id === initialStreamingMessageId) && msg.id !== streamingMessageId && !isTyping} /> : null}
          <MessageBubble
            senderLabelId={`${senderIdPrefix}-${msg.id}`}
            message={msg}
            earlierMessages={messages.slice(0, index)}
            laterMessages={messages.slice(index + 1)}
            blockAnswerInteraction={blockAnswerInteraction}
            onSendMessage={sendMessage}
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
          {msg.role === 'ai' && msg.toolSteps?.length ? <ThinkingTrace steps={msg.toolSteps} running={false} /> : null}
          {msg.proactiveItem ? <ProactiveAction isOnline={chat.isOnline} item={msg.proactiveItem} acted={msg.proactiveActed ?? false} onSend={sendMessage} /> : null}
          {msg.role === 'ai' && msg.id === messages.at(-1)?.id && canShowFollowUps ? <FollowUpChips followUps={msg.followUps ?? []} followUpContext={msg.followUpContext} onSelect={(text) => void sendMessage(text, 'followUp')} /> : null}
          </div>
          </article>
        ))}
        {showPendingReply || activeSteps.length > 0 ? <ConversationReveal animate className="flex min-w-0 flex-col gap-2">
          {messages.at(-1)?.role !== 'ai' ? <span aria-hidden="true" className="pointer-events-none block size-6 shrink-0 text-[var(--fg-1)]" data-astra-avatar="">
            <AstraGlyph size={24} />
          </span> : null}
          <div className="flex min-w-0 w-full flex-col gap-4">
            {showPendingReply ? <div data-astra-pending aria-hidden="true" className="pointer-events-none flex h-6 items-center">
              <span className="astra-pending-pulse" style={{ animationPlayState: pendingVisible ? 'running' : 'paused' }}><WorkingMark /></span>
            </div> : <ThinkingTrace steps={activeSteps} running />}
          </div>
        </ConversationReveal> : null}
        </div>
        {!showSuggestions ? <p data-testid="astra-ai-disclosure" className="mx-auto max-w-[300px] py-4 text-center text-xs leading-[1.4] text-[var(--fg-3)]">{t('aiDisclosure.notMedicalAdvice')}</p> : null}
      </div>

      <div className="shrink-0">
        {notice !== undefined ? <div data-shell-notice="">{notice}</div> : null}
        <PendingPromptIdea hasDraft={!!composerProps.value} disabledReason={disabledReason} onSelect={selectIdea} />
        <Composer {...composerProps} inputSelection={inputSelection} onChangeValue={value => { setInputSelection(undefined); composerProps.onChangeValue(value) }} autoFocus suggestions={resolveConversationSuggestions(messages.length, composerProps.suggestions)} />
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
      <AnimatePresence initial={false}>{libraryOpen && PromptLibrary ? <PromptLibrary key="prompt-library" onBack={returnToConversation} onSelect={selectIdea} suggestions={composerProps.suggestions} hasProAccess={chat.hasProAccess} hasGoogleConnection={chat.hasGoogleConnection} disabledReason={disabledReason} /> : null}</AnimatePresence>
      {libraryOpen && !PromptLibrary && libraryLoadFailed ? <PromptLibraryLoadFailure onBack={returnToConversation} onRetry={() => setLibraryLoadAttempt(attempt => attempt + 1)} /> : null}
    </div>
    </ChatCardOperationContext.Provider>
  )
}
