import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageHeader } from '@/components/ui/page-header'

describe('PageHeader', () => {
  it('names the back control and exposes one start-aligned page heading', () => {
    const onBack = vi.fn()
    const view = render(<PageHeader title="About" backLabel="Back to Profile" onBack={onBack} />)
    const heading = screen.getByRole('heading', { level: 1, name: 'About' })
    expect(heading).toHaveClass('text-start')
    expect(view.container.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Profile' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
