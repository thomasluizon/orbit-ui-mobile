import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/chat/suggestion-chips', () => ({
  SuggestionChips: ({ onSelect, contextualAction }: {
    onSelect: (suggestion: string) => void
    contextualAction?: { label: string; onSelect: () => void }
  }) => (
    <div>
      {contextualAction ? <button type="button" onClick={contextualAction.onSelect}>{contextualAction.label}</button> : null}
      <button type="button" onClick={() => onSelect('Como foi a semana')}>Como foi a semana</button>
    </div>
  ),
}))

const astraSuggestions = vi.hoisted(() => ({
  current: [] as { id: string; key: string }[] | null,
}))

vi.mock('@/hooks/use-astra-suggestions', () => ({
  useAstraSuggestions: () => astraSuggestions.current,
}))

import { ChatEmptyState } from '@/components/chat/chat-empty-state'

describe('ChatEmptyState', () => {
  afterEach(() => {
    astraSuggestions.current = []
    cleanup()
  })

  it('heads the empty thread with the Astra mark, on no disc and with no accent', () => {
    const { container } = render(<ChatEmptyState onSelectSuggestion={vi.fn()} />)

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

  it('keeps its suggestions out of the conversation live log', () => {
    render(
      <div role="log" aria-live="polite">
        <ChatEmptyState onSelectSuggestion={vi.fn()} />
      </div>,
    )

    const suggestion = screen.getByRole('button', { name: 'Como foi a semana' })
    expect(suggestion.closest('[aria-live]')).toHaveAttribute('aria-live', 'off')
  })

  it('holds back the prompt and the suggestions until the habit list arrives', () => {
    astraSuggestions.current = null
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} />)

    expect(screen.getByText('chat.empty.title')).toBeInTheDocument()
    expect(screen.queryByText('chat.suggestion.prompt')).toBeNull()
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toBeInTheDocument()
  })

  it('offers a requested contextual action at once, while the habit list is still on its way', () => {
    astraSuggestions.current = null
    const onSelect = vi.fn()
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} contextualAction={{ label: 'Create a goal', onSelect }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Create a goal' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByText('chat.suggestion.prompt')).toBeInTheDocument()
  })

  it('renders the drawn title and the prompt over the suggestions', () => {
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} />)

    expect(screen.getByText('chat.empty.title')).toBeInTheDocument()
    expect(screen.getByText('chat.suggestion.prompt')).toHaveStyle({ fontSize: 'var(--fs-sm)', color: 'var(--fg-3)' })
  })

  it('sets the medical-advice disclosure on the type scale', () => {
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} />)

    expect(screen.getByText('aiDisclosure.notMedicalAdvice')).toHaveStyle({ fontSize: 'var(--fs-xs)', color: 'var(--fg-3)' })
  })

  it('forwards a chosen suggestion to onSelectSuggestion', () => {
    const onSelectSuggestion = vi.fn()
    render(<ChatEmptyState onSelectSuggestion={onSelectSuggestion} />)

    fireEvent.click(screen.getByRole('button', { name: 'Como foi a semana' }))

    expect(onSelectSuggestion).toHaveBeenCalledWith('Como foi a semana')
  })

  it('shows a requested contextual action beside the suggestions', () => {
    const onSelect = vi.fn()
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} contextualAction={{ label: 'Create a goal', onSelect }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Create a goal' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Como foi a semana' })).toBeInTheDocument()
  })
})
