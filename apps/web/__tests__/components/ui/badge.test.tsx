import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Premium</Badge>)
    expect(screen.getByText('Premium')).toHaveClass('whitespace-nowrap')
  })

  it.each(['solid', 'outline'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>)
      expect(screen.getByText(variant)).toBeInTheDocument()
    },
  )
})
