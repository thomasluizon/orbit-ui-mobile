import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Home } from '@/components/ui/icons'
import { SettingsRow } from '@/components/ui/settings-row'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'

describe('SettingsRow', () => {
  it('draws the canonical ListRow leading icon geometry', () => {
    const { container } = render(
      <SettingsRow label="Account" icon={Home} accessory="none" />,
    )

    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('width', '24')
    expect(icon).toHaveAttribute('height', '24')
    expect(icon).toHaveAttribute('stroke-width', '1.5')
    expect(icon?.parentElement).toHaveStyle({ width: '28px' })
  })

  it('renders an actionable row as one button that runs its action', () => {
    const openAccount = vi.fn()
    render(<SettingsRow label="Account" value="Alex" onClick={openAccount} />)

    fireEvent.click(screen.getByRole('button', { name: /Account/ }))
    expect(openAccount).toHaveBeenCalledOnce()
  })

  it('lets a ProfileNavIcon inherit its row color', () => {
    const { container } = render(<span style={{ color: 'var(--fg-1)' }}><ProfileNavIcon iconKey="wrapped" /></span>)
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor')
  })
})
