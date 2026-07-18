import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLabel } from '@/components/ui/section-label'

describe('SectionLabel', () => {
  it('defaults to the section level and an h2 element', () => {
    render(<SectionLabel>Hábitos</SectionLabel>)
    const heading = screen.getByRole('heading', { name: 'Hábitos', level: 2 })
    expect(heading).toBeInTheDocument()
    expect(heading.closest('[data-section-label]')).toHaveAttribute('data-level', 'section')
  })

  it('picks the visual level independently of the semantic element', () => {
    render(
      <SectionLabel level="page" as="h1">
        Conquistas
      </SectionLabel>,
    )
    expect(screen.getByRole('heading', { name: 'Conquistas', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Conquistas').closest('[data-section-label]')).toHaveAttribute(
      'data-level',
      'page',
    )
  })

  it('renders a supporting description and a trailing slot', () => {
    render(
      <SectionLabel description="Acompanhe seu progresso" trailing={<span data-testid="tr" />}>
        Metas
      </SectionLabel>,
    )
    expect(screen.getByText('Acompanhe seu progresso')).toBeInTheDocument()
    expect(screen.getByTestId('tr')).toBeInTheDocument()
  })

  it('omits the description node when none is given', () => {
    const { container } = render(<SectionLabel>Metas</SectionLabel>)
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })
})
