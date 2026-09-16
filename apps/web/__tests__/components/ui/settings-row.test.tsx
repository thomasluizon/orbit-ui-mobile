import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from '@/components/ui/icons'
import { SettingsRow } from '@/components/ui/settings-row'

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
})
