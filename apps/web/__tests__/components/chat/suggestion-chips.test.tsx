import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { SuggestionChips } from '@/components/chat/suggestion-chips'

describe('SuggestionChips', () => {
  it('renders three suggestion chips', () => {
    render(<SuggestionChips onSelect={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(3)
  })

  it('renders suggestion text from i18n', () => {
    render(<SuggestionChips onSelect={vi.fn()} />)
    expect(screen.getByText('chat.suggestion.meditated')).toBeInTheDocument()
    expect(screen.getByText('chat.suggestion.exercise')).toBeInTheDocument()
    expect(screen.getByText('chat.suggestion.groceries')).toBeInTheDocument()
  })

  it('calls onSelect with the suggestion text when clicked', () => {
    const onSelect = vi.fn()
    render(<SuggestionChips onSelect={onSelect} />)
    fireEvent.click(screen.getByText('chat.suggestion.meditated'))
    expect(onSelect).toHaveBeenCalledWith('chat.suggestion.meditated')
  })

  it('calls onSelect for each chip independently', () => {
    const onSelect = vi.fn()
    render(<SuggestionChips onSelect={onSelect} />)
    fireEvent.click(screen.getByText('chat.suggestion.exercise'))
    expect(onSelect).toHaveBeenCalledWith('chat.suggestion.exercise')
    fireEvent.click(screen.getByText('chat.suggestion.groceries'))
    expect(onSelect).toHaveBeenCalledWith('chat.suggestion.groceries')
  })

  it('chips have rounded-full styling', () => {
    render(<SuggestionChips onSelect={vi.fn()} />)
    const button = screen.getByText('chat.suggestion.meditated')
    expect(button.className).toContain('rounded-full')
  })
})
