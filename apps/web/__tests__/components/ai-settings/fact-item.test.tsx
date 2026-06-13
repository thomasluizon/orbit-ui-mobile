import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { UserFact } from '@orbit/shared/types/user-fact'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { FactItem } from '@/app/(app)/ai-settings/_components/fact-item'

function makeFact(overrides: Partial<UserFact> = {}): UserFact {
  return {
    id: 'fact-1',
    factText: 'Prefers morning workouts',
    category: 'preference',
    extractedAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    ...overrides,
  }
}

describe('FactItem', () => {
  it('renders the fact text', () => {
    render(
      <FactItem
        fact={makeFact()}
        selectMode={false}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('Prefers morning workouts')).toBeInTheDocument()
  })

  it('renders the uppercased category label when a category is present', () => {
    render(
      <FactItem
        fact={makeFact()}
        selectMode={false}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('PROFILE.FACTS.PREFERENCE')).toBeInTheDocument()
  })

  it('omits the category label when there is no category', () => {
    render(
      <FactItem
        fact={makeFact({ category: null })}
        selectMode={false}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByText('PROFILE.FACTS.PREFERENCE')).not.toBeInTheDocument()
  })

  it('shows a delete button outside select mode and fires onDelete', () => {
    const onDelete = vi.fn()
    render(
      <FactItem
        fact={makeFact()}
        selectMode={false}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByLabelText('common.delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders a pressable toggle in select mode and fires onToggleSelection', () => {
    const onToggleSelection = vi.fn()
    render(
      <FactItem
        fact={makeFact()}
        selectMode={true}
        isSelected={false}
        onToggleSelection={onToggleSelection}
        onDelete={vi.fn()}
      />,
    )
    const toggle = screen.getByRole('button', { pressed: false })
    fireEvent.click(toggle)
    expect(onToggleSelection).toHaveBeenCalled()
  })

  it('reflects the selected state via aria-pressed in select mode', () => {
    render(
      <FactItem
        fact={makeFact()}
        selectMode={true}
        isSelected={true}
        onToggleSelection={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument()
  })

  it('hides the delete button in select mode', () => {
    render(
      <FactItem
        fact={makeFact()}
        selectMode={true}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('common.delete')).not.toBeInTheDocument()
  })
})
