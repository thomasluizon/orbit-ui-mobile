import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionLabel } from '@/components/ui/section-label'

describe('SectionLabel', () => {
  it('renders headings with an optional eyebrow above the heading', () => {
    const { container } = render(<><SectionLabel>Habits</SectionLabel><SectionLabel eyebrow="This week">Goals</SectionLabel></>)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
    expect(container.querySelectorAll('[data-eyebrow]')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Goals' }).previousElementSibling).toBe(screen.getByText('This week'))
  })
})
