import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { ConflictWarning } from '@/components/chat/conflict-warning'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'

function makeWarning(overrides: Partial<ConflictWarningType> = {}): ConflictWarningType {
  return {
    severity: 'MEDIUM',
    conflictingHabits: [],
    recommendation: null,
    ...overrides,
  } as ConflictWarningType
}

describe('ConflictWarning', () => {
  it.each(['HIGH', 'MEDIUM', 'LOW'] as const)(
    'renders with %s severity styling',
    (severity) => {
      const { container } = render(
        <ConflictWarning warning={makeWarning({ severity })} />,
      )
      const wrapper = container.firstElementChild
      expect(wrapper?.getAttribute('data-severity')).toBe(severity)
    },
  )

  it('renders conflicting habits', () => {
    const warning = makeWarning({
      conflictingHabits: [
        { habitId: 'h1', habitTitle: 'Exercise', conflictDescription: 'Same time slot' },
      ],
    })
    render(<ConflictWarning warning={warning} />)
    expect(screen.getByText('Exercise')).toBeInTheDocument()
    expect(screen.getByText(/Same time slot/)).toBeInTheDocument()
  })

  it('renders recommendation when present', () => {
    const warning = makeWarning({ recommendation: 'Consider adjusting schedule' })
    render(<ConflictWarning warning={warning} />)
    expect(screen.getByText('Consider adjusting schedule')).toBeInTheDocument()
  })

  it('renders title', () => {
    render(<ConflictWarning warning={makeWarning()} />)
    expect(screen.getByText('chat.conflict.title')).toBeInTheDocument()
  })
})
