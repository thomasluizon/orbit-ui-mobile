import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, type BadgeTone } from '@/components/ui/badge'

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Premium</Badge>)
    expect(screen.getByText('Premium')).toBeInTheDocument()
  })

  it.each<BadgeTone>(['violet', 'soft', 'outline', 'amber', 'bad'])(
    'renders the %s tone',
    (tone) => {
      render(<Badge tone={tone}>{tone}</Badge>)
      expect(screen.getByText(tone)).toBeInTheDocument()
    },
  )
})
