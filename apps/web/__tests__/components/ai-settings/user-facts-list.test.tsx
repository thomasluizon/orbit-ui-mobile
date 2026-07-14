import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { UserFact } from '@orbit/shared/types/user-fact'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/satellite-glyph', () => ({ SatelliteGlyph: () => <span data-testid="glyph" /> }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))
vi.mock('@/app/(app)/ai-settings/_components/fact-item', () => ({
  FactItem: ({ fact, onDelete, onToggleSelection }: {
    fact: UserFact; onDelete: () => void; onToggleSelection: () => void
  }) => (
    <div data-testid="fact">
      <span>{fact.factText}</span>
      <button type="button" aria-label={`delete-${fact.id}`} onClick={onDelete} />
      <button type="button" aria-label={`toggle-${fact.id}`} onClick={onToggleSelection} />
    </div>
  ),
}))

import { UserFactsList } from '@/app/(app)/ai-settings/_components/user-facts-list'

function makeFact(id: string, factText: string): UserFact {
  return { id, factText, category: null, extractedAtUtc: '2026-01-01T00:00:00Z', updatedAtUtc: null }
}

const baseProps = {
  isLoading: false,
  hasError: false,
  facts: [] as UserFact[],
  pagedFacts: [] as UserFact[],
  selectMode: false,
  selectedFactIds: new Set<string>(),
  onToggleSelection: vi.fn(),
  onDelete: vi.fn(),
  onRetry: vi.fn(),
  onAskAstra: vi.fn(),
}

describe('UserFactsList', () => {
  it('renders skeletons while loading', () => {
    const { container } = render(<UserFactsList {...baseProps} isLoading />)
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2)
    expect(screen.queryByTestId('fact')).not.toBeInTheDocument()
  })

  it('shows a retryable error state', () => {
    const onRetry = vi.fn()
    render(<UserFactsList {...baseProps} hasError onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('profile.facts.factsError')
    fireEvent.click(screen.getByRole('button', { name: 'profile.facts.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers an Ask Astra CTA when there are no facts', () => {
    const onAskAstra = vi.fn()
    render(<UserFactsList {...baseProps} onAskAstra={onAskAstra} />)
    expect(screen.getByText('profile.facts.empty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'summary.askAstra' }))
    expect(onAskAstra).toHaveBeenCalledTimes(1)
  })

  it('renders the paged facts and forwards delete and selection', () => {
    const onDelete = vi.fn()
    const onToggleSelection = vi.fn()
    const facts = [makeFact('f-1', 'Likes tea'), makeFact('f-2', 'Runs at dawn')]
    render(
      <UserFactsList
        {...baseProps}
        facts={facts}
        pagedFacts={facts}
        onDelete={onDelete}
        onToggleSelection={onToggleSelection}
      />,
    )
    expect(screen.getAllByTestId('fact')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'delete-f-1' }))
    expect(onDelete).toHaveBeenCalledWith('f-1')
    fireEvent.click(screen.getByRole('button', { name: 'toggle-f-2' }))
    expect(onToggleSelection).toHaveBeenCalledWith('f-2')
  })
})
