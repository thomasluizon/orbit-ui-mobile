import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { createRef } from 'react'
import { buildComposerChips } from '@orbit/shared/chat'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { AstraConversation } from '@/components/chat/conversation'
import { useChatStore } from '@/stores/chat-store'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'

describe('ChatEmptyState', () => {
  afterEach(() => {
    useChatStore.getState().setContextualSuggestion(null)
    cleanup()
  })

  it('heads the empty thread with the Astra mark, on no disc and with no accent', () => {
    const { container } = render(<ChatEmptyState />)

    const mark = container.querySelector('[data-mark="astra"]')
    expect(mark).not.toBeNull()
    expect(mark?.querySelector('[data-asset="astra-mark"]')).not.toBeNull()
    for (const element of [mark, ...(mark?.querySelectorAll<HTMLElement>('*') ?? [])]) {
      expect((element as HTMLElement).style.background).toBe('')
      expect((element as HTMLElement).style.backgroundColor).toBe('')
    }
    for (const element of container.querySelectorAll<HTMLElement>('*')) {
      expect(element.getAttribute('style') ?? '').not.toContain('--primary')
      expect(element.className.toString()).not.toContain('--primary')
    }
  })

  it('keeps the empty introduction out of the conversation live log', () => {
    render(<div role="log" aria-live="polite"><ChatEmptyState /></div>)

    expect(screen.getByText('chat.empty.title').closest('[aria-live]')).toHaveAttribute('aria-live', 'off')
  })

  it('renders the title and disclosure without an opener prompt or chip', () => {
    render(<ChatEmptyState />)

    expect(screen.getByText('chat.empty.title')).toBeInTheDocument()
    expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getAllByText(/chat.empty.title|aiDisclosure.notMedicalAdvice/)).toHaveLength(2)
  })

  it('sets the medical-advice disclosure on the type scale', () => {
    render(<ChatEmptyState />)

    expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toHaveStyle({ fontSize: 'var(--fs-xs)', color: 'var(--fg-3)' })
  })

  function emptyConversation(state: 'idle' | 'atLimit', progress = false) {
    const sendMessage = vi.fn()
    const chips = buildComposerChips({
      surface: progress ? 'progress' : 'today', status: 'success',
      habits: [createMockHabit({ title: 'Walking' })], totalHabitCount: 1,
      profile: createMockProfile(), contextualSuggestion: useChatStore.getState().contextualSuggestion,
    })
    const suggestions = toComposerSuggestions(chips.map(chip => ({
      id: chip.id, label: chip.label ?? chip.key,
      onSelect: () => sendMessage(chip.prompt ?? chip.promptKey ?? chip.key),
    })))
    const composerProps = {
      words: { placeholder: 'placeholder', send: 'send', actions: 'actions', suggestionsLabel: 'live suggestions' },
      value: '', onChangeValue: vi.fn(), onSend: vi.fn(), suggestions,
      ...(state === 'atLimit' ? { state, limitReason: 'No messages today' } : { state }),
    } satisfies ComposerProps
    const chat = {
      chatContainerRef: createRef<HTMLDivElement>(), messages: [], activeSteps: [], showSuggestions: true,
      isTyping: false, streamingMessageId: null, canShowFollowUps: false, sendMessage, composerProps,
    } as unknown as Parameters<typeof AstraConversation>[0]['chat']
    render(<AstraConversation chat={chat} />)
    return { sendMessage, suggestions }
  }

  it('keeps one live suggestion group above the input in an empty conversation', () => {
    const { suggestions } = emptyConversation('idle')

    expect(within(screen.getByRole('feed')).queryAllByRole('button')).toEqual([])
    const strip = screen.getByRole('group', { name: 'live suggestions' })
    expect(screen.getAllByRole('group', { name: 'live suggestions' })).toHaveLength(1)
    expect(within(strip).getAllByRole('button').map(chip => chip.textContent)).toEqual(suggestions.map(chip => chip.label))
  })

  it('shows the requested Progress action once in the composer and sends its prompt', () => {
    useChatStore.getState().setContextualSuggestion({ id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal' })
    const { sendMessage } = emptyConversation('idle', true)

    expect(screen.getAllByRole('button', { name: 'Create a goal' })).toHaveLength(1)
    fireEvent.click(within(screen.getByRole('group', { name: 'live suggestions' })).getByRole('button', { name: 'Create a goal' }))
    expect(sendMessage).toHaveBeenCalledWith('Help me make a goal')
  })

  it('shows no suggestion chip anywhere in an empty conversation at the daily limit', () => {
    const { suggestions } = emptyConversation('atLimit')

    expect(screen.queryByRole('group', { name: 'live suggestions' })).toBeNull()
    expect(within(screen.getByRole('feed')).queryAllByRole('button')).toEqual([])
    for (const chip of suggestions) expect(screen.queryByRole('button', { name: chip.label })).toBeNull()
    expect(screen.getByText('No messages today')).toBeInTheDocument()
  })
})
