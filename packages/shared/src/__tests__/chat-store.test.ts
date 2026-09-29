import { beforeEach, describe, expect, it } from 'vitest'
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
