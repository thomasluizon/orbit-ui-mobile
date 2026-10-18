import { beforeEach, describe, expect, it } from 'vitest'
import { createMockProactiveItem } from './factories'
import type { ChatStoreState } from '../stores/chat-store'
import {
  clearContextualSuggestionIfCurrent,
  createChatStoreState,
  prepareChatRequest,
} from '../stores/chat-store'

function createStoreHarness() {
  let state = {} as ChatStoreState

  const set = (
    partial: Partial<ChatStoreState> | ((current: ChatStoreState) => Partial<ChatStoreState>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }

  state = createChatStoreState(set)

  return {
    getState: () => state,
  }
}

describe('shared chat store', () => {
  beforeEach(() => {
    createStoreHarness()
  })

  it('opens the item as the first AI message without spending a message or changing a draft', () => {
    const store = createStoreHarness()
    const item = createMockProactiveItem()
    store.getState().setDraft('Keep my draft')
    store.getState().addMessage({ id: 'previous', role: 'user', content: 'Previous thread', timestamp: new Date() })
    expect(store.getState().openProactiveItem(item)).toBe(true)
    expect(store.getState().messages).toEqual([expect.objectContaining({ role: 'ai', content: item.text, proactiveItem: item }), expect.objectContaining({ id: 'previous', content: 'Previous thread' })])
    expect(store.getState().draft).toBe('Keep my draft')
    expect(store.getState().isTyping).toBe(false)
    expect(store.getState().openProactiveItem(item)).toBe(false)
    expect(store.getState().messages).toHaveLength(2)
    expect(store.getState().claimProactiveAction(item.id)).toBe(true)
    expect(store.getState().claimProactiveAction(item.id)).toBe(false)
    expect(store.getState().messages[0]?.proactiveActed).toBe(true)
    expect(store.getState().claimProactiveAction('unknown')).toBe(false)
  })

  it('keeps the in-flight reply when a proactive item becomes the first message', () => {
    const store = createStoreHarness()
    const item = createMockProactiveItem()
    store.getState().addMessage({ id: 'streaming', role: 'ai', content: 'Partial', timestamp: new Date() })
    store.getState().setStreamingMessageId('streaming')
    expect(store.getState().openProactiveItem(item)).toBe(true)
    store.getState().appendToMessageContent('streaming', ' reply')
    expect(store.getState().messages[0]).toMatchObject({ role: 'ai', content: item.text })
    expect(store.getState().messages.find((message) => message.id === 'streaming')?.content).toBe('Partial reply')
    expect(store.getState().streamingMessageId).toBe('streaming')
  })

  it('reopens the current summary first without duplicating it or interrupting a reply', () => {
    const store = createStoreHarness()
    store.getState().addMessage({ id: 'streaming', role: 'ai', content: 'Partial', timestamp: new Date() })
    store.getState().setStreamingMessageId('streaming')
    store.getState().setDraft('My draft')
    store.getState().openDailySummary('2026-08-29', 'Morning. More guidance.')
    store.getState().appendToMessageContent('streaming', ' reply')
    store.getState().openDailySummary('2026-08-29', 'Afternoon. Updated guidance.')
    expect(store.getState().messages).toEqual([
      expect.objectContaining({ role: 'ai', content: 'Afternoon. Updated guidance.' }),
      expect.objectContaining({ id: 'streaming', content: 'Partial reply' }),
    ])
    expect(store.getState().proactiveEntryId).toBe('daily-summary-2026-08-29')
    expect(store.getState().draft).toBe('My draft')
    expect(store.getState().streamingMessageId).toBe('streaming')
  })

  it('appends messages and tracks the active streamed message', () => {
    const store = createStoreHarness()
    const { addMessage, setIsTyping, setStreamingMessageId } = store.getState()

    addMessage({
      id: 'message-1',
      role: 'ai',
      content: 'Hello',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })
    setIsTyping(true)
    setStreamingMessageId('message-1')

    expect(store.getState()).toMatchObject({
      isTyping: true,
      streamingMessageId: 'message-1',
      messages: [
        expect.objectContaining({
          id: 'message-1',
          role: 'ai',
          content: 'Hello',
        }),
      ],
    })
  })

  it('appends streamed text to the target message only', () => {
    const store = createStoreHarness()
    store.getState().addMessage({
      id: 'draft-1',
      role: 'ai',
      content: '',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })
    store.getState().addMessage({
      id: 'other',
      role: 'user',
      content: 'question',
      timestamp: new Date('2026-04-06T00:00:01Z'),
    })

    store.getState().appendToMessageContent('draft-1', 'Hel')
    store.getState().appendToMessageContent('draft-1', 'lo!')
    store.getState().appendToMessageContent('missing-id', 'ignored')

    const [draft, other] = store.getState().messages
    expect(draft?.content).toBe('Hello!')
    expect(other?.content).toBe('question')
  })

  it('patches an existing message without touching other fields', () => {
    const store = createStoreHarness()
    store.getState().addMessage({
      id: 'draft-1',
      role: 'ai',
      content: 'streamed text',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })

    store.getState().updateMessage('draft-1', {
      content: 'final text',
      correlationId: 'trace-9',
    })

    expect(store.getState().messages[0]).toMatchObject({
      id: 'draft-1',
      role: 'ai',
      content: 'final text',
      correlationId: 'trace-9',
    })
  })

  it('publishes and clears a contextual suggestion', () => {
    const store = createStoreHarness()
    const suggestion = {
      id: 'habit-detail-help',
      label: 'Ask Astra about this habit',
      prompt: 'Help me improve Read',
    }

    store.getState().setContextualSuggestion(suggestion)
    expect(store.getState().contextualSuggestion).toEqual(suggestion)

    store.getState().setContextualSuggestion(null)
    expect(store.getState().contextualSuggestion).toBeNull()
  })

  it('prefers pre-hydration text, then a live draft, then the stored draft', () => {
    const store = createStoreHarness()
    store.getState().setDraft('Read')
    store.getState().setDraft((current) => `${current} today`)
    store.getState().hydrateDraft('stale saved draft', 'Typed early')
    expect(store.getState()).toMatchObject({
      draft: 'Typed early', draftRevision: 2, draftHydrated: true,
    })

    const emptyStore = createStoreHarness()
    emptyStore.getState().hydrateDraft('saved draft', '')
    expect(emptyStore.getState().draft).toBe('saved draft')

    const liveStore = createStoreHarness()
    liveStore.getState().setDraft('Live draft')
    liveStore.getState().hydrateDraft('stale saved draft', '')
    expect(liveStore.getState().draft).toBe('Live draft')
  })

  it('keeps an existing draft and offers a contextual request', () => {
    const store = createStoreHarness()
    const request = { id: 'progress-create-goal', label: 'Create goal', prompt: 'Help me set a goal' }
    store.getState().setDraft('My own text')

    prepareChatRequest(store.getState(), request)

    expect(store.getState().draft).toBe('My own text')
    expect(store.getState().contextualSuggestion).toEqual(request)
  })

  it('places a request in an empty draft without replacing another suggestion', () => {
    const store = createStoreHarness()
    const existing = { id: 'habit-1', label: 'Ask Astra', prompt: 'Help with this habit' }
    store.getState().setContextualSuggestion(existing)

    prepareChatRequest(store.getState(), { id: 'progress-create-goal', label: 'Create goal', prompt: 'Help me set a goal' })

    expect(store.getState().draft).toBe('Help me set a goal')
    expect(store.getState().contextualSuggestion).toEqual(existing)
  })

  it('clears a scoped suggestion only while it is still current', () => {
    const store = createStoreHarness()
    const suggestion = { id: 'habit-1', label: 'Ask Astra', prompt: 'Help with this habit' }
    store.getState().setContextualSuggestion(suggestion)
    expect(store.getState().contextualSuggestion).toEqual(suggestion)

    store.getState().setContextualSuggestion({ id: 'habit-2', label: 'Ask Astra', prompt: 'Another habit' })
    clearContextualSuggestionIfCurrent(store.getState(), 'habit-1')
    expect(store.getState().contextualSuggestion?.id).toBe('habit-2')

    clearContextualSuggestionIfCurrent(store.getState(), 'habit-2')
    expect(store.getState().contextualSuggestion).toBeNull()
  })
})
