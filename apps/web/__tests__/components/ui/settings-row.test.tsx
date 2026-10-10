import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Home } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'

describe('SettingsRow', () => {
  it('renders metadata in the shared value slot', () => {
    render(<ListRow textMode="label" title="Usage" value="42" chevron={false} />)
    expect(screen.getByText('42')).toHaveAttribute('data-slot', 'list-row-value')
  })

  it('draws the canonical ListRow leading icon geometry', () => {
    const { container } = render(
      <ListRow textMode="label" title="Account" icon={<Home size={24} strokeWidth={1.5} />} chevron={false} />,
    )

    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('width', '24')
    expect(icon).toHaveAttribute('height', '24')
    expect(icon).toHaveAttribute('stroke-width', '1.5')
    expect(icon?.parentElement).toHaveStyle({ width: '28px' })
  })

  it('renders an actionable row as one button that runs its action', () => {
    const openAccount = vi.fn()
    render(<ListRow textMode="label" title="Account" value="Alex" onClick={openAccount} />)

    fireEvent.click(screen.getByRole('button', { name: /Account/ }))
    expect(openAccount).toHaveBeenCalledOnce()
  })

  it('lets a ProfileNavIcon inherit its row color', () => {
    const { container } = render(<span style={{ color: 'var(--fg-1)' }}><ProfileNavIcon iconKey="wrapped" /></span>)
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor')
  })
})
