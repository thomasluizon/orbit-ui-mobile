import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from '@/components/ui/list-row'

describe('ListRow disclosure', () => {
  it('announces the controlled editor and its open state', () => {
    const props = { title: 'Frequency', onClick: vi.fn(), controls: 'schedule-editor' }
    const view = render(<ListRow {...props} expanded={false} />)
    expect(screen.getByRole('button', { name: 'Frequency' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Frequency' })).toHaveAttribute('aria-controls', 'schedule-editor')
    view.rerender(<ListRow {...props} expanded />)
    expect(screen.getByRole('button', { name: 'Frequency' })).toHaveAttribute('aria-expanded', 'true')
    view.rerender(<ListRow title="Frequency" onClick={props.onClick} />)
    expect(screen.getByRole('button', { name: 'Frequency' })).not.toHaveAttribute('aria-expanded')
  })
})
