import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from '@/components/ui/list-row'

describe('ListRow disclosure', () => {
  it('keeps newly added trailing controls accessible after a strict ref remount', async () => {
    const props = { title: 'Habit', textMode: 'personal' as const, personalExpanded: false, onClick: vi.fn() }
    const view = render(<StrictMode><ListRow {...props} /></StrictMode>)
    view.rerender(<StrictMode><ListRow {...props} trailing={<button type="button">Trailing action</button>} /></StrictMode>)
    expect(await screen.findByRole('button', { name: 'Trailing action' })).toBeVisible()
  })

  it('keeps a personal destination name inside its native link', () => {
    const email = 'longaddress@example.com'
    render(<ListRow title="Account" description={email} textMode="personal" href="/profile/account" />)
    expect(screen.getByRole('link', { name: /Account.*longaddress@example.com/u })).toContainElement(screen.getByText(email))
  })

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
