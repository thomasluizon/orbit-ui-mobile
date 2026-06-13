import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { ChatEmptyState } from '@/app/(chat)/chat/chat-empty-state'

describe('ChatEmptyState', () => {
  it('renders the empty-state title and prompt copy', () => {
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} />)
    expect(screen.getByText('chat.empty.title')).toBeInTheDocument()
    expect(screen.getByText('chat.suggestion.prompt')).toBeInTheDocument()
  })

  it('renders the medical-advice disclosure', () => {
    render(<ChatEmptyState onSelectSuggestion={vi.fn()} />)
    expect(
      screen.getByText('aiDisclosure.notMedicalAdvice'),
    ).toBeInTheDocument()
  })

  it('forwards a chosen suggestion to onSelectSuggestion', () => {
    const onSelectSuggestion = vi.fn()
    render(<ChatEmptyState onSelectSuggestion={onSelectSuggestion} />)
    fireEvent.click(screen.getByText('chat.suggestion.meditated'))
    expect(onSelectSuggestion).toHaveBeenCalledWith('chat.suggestion.meditated')
  })
})
