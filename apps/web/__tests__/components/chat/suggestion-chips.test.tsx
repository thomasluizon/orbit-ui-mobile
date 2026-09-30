import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AstraSuggestion } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.habit === undefined ? key : `${key}:${values.habit}`,
}))

import { SuggestionChips } from '@/components/chat/suggestion-chips'

function suggestionsNaming(habit: string): AstraSuggestion[] {
  return [
    { id: 'logHabit', key: 'chat.suggestion.logHabit', params: { habit } },
    { id: 'week', key: 'chat.suggestion.week' },
    { id: 'splitHabit', key: 'chat.suggestion.splitHabit', params: { habit } },
    { id: 'goals', key: 'chat.suggestion.goals' },
  ]
}

describe('SuggestionChips', () => {
  afterEach(cleanup)

  it('draws the suggestions in the order given', () => {
    render(<SuggestionChips suggestions={suggestionsNaming('Caminhar')} onSelect={vi.fn()} />)

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'chat.suggestion.logHabit:Caminhar',
      'chat.suggestion.week',
      'chat.suggestion.splitHabit:Caminhar',
      'chat.suggestion.goals',
    ])
  })

  it('sends the shown text when a suggestion is pressed', () => {
    const onSelect = vi.fn()
    render(<SuggestionChips suggestions={suggestionsNaming('Caminhar')} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.suggestion.logHabit:Caminhar' }))

    expect(onSelect).toHaveBeenCalledWith('chat.suggestion.logHabit:Caminhar')
  })

  it('keeps focus on a suggestion whose habit changes under it', () => {
    const { rerender } = render(<SuggestionChips suggestions={suggestionsNaming('Caminhar')} onSelect={vi.fn()} />)
    const logSuggestion = screen.getByRole('button', { name: 'chat.suggestion.logHabit:Caminhar' })
    logSuggestion.focus()

    rerender(<SuggestionChips suggestions={suggestionsNaming('Ler')} onSelect={vi.fn()} />)

    expect(document.activeElement).toBe(logSuggestion)
    expect(logSuggestion).toHaveTextContent('chat.suggestion.logHabit:Ler')
  })

  it('puts a requested contextual action ahead of the suggestions', () => {
    const onContextual = vi.fn()
    render(
      <SuggestionChips
        suggestions={suggestionsNaming('Caminhar')}
        onSelect={vi.fn()}
        contextualAction={{ label: 'Criar uma meta', onSelect: onContextual }}
      />,
    )

    const [first] = screen.getAllByRole('button')
    expect(first).toHaveTextContent('Criar uma meta')
    fireEvent.click(first as HTMLElement)
    expect(onContextual).toHaveBeenCalledTimes(1)
  })

  it('never paints a suggestion with the accent', () => {
    render(<SuggestionChips suggestions={suggestionsNaming('Caminhar')} onSelect={vi.fn()} />)

    for (const button of screen.getAllByRole('button')) {
      expect(button.outerHTML).not.toContain('--primary')
      expect(button).toHaveAttribute('type', 'button')
    }
  })
})
