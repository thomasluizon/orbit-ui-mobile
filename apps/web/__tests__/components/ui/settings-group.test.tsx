import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { SettingsGroup } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'

describe('SettingsRow', () => {
  it('draws no rule of its own, so a standalone row sits flat', () => {
    const { container } = render(<SettingsRow label="Language" accessory="none" />)
    expect(container.querySelectorAll('[data-separator]')).toHaveLength(0)
  })

  it('renders the label and calls onClick when activated', () => {
    const onClick = vi.fn()
    render(<SettingsRow label="Language" onClick={onClick} ariaLabel="Language" />)

    fireEvent.click(screen.getByRole('button', { name: 'Language' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders the label and a long pt-BR value together', () => {
    render(
      <SettingsRow
        label="Idioma"
        value="Português (Brasil) - formato longo"
        accessory="none"
      />,
    )

    expect(screen.getByText('Idioma')).toBeInTheDocument()
    expect(screen.getByText('Português (Brasil) - formato longo')).toBeInTheDocument()
  })
})

describe('SettingsGroup', () => {
  it('separates adjacent rows but never trails a rule after the last one', () => {
    const { container } = render(
      <SettingsGroup>
        <SettingsRow label="Language" accessory="none" />
        <SettingsRow label="Theme" accessory="none" />
        <SettingsRow label="Week start" accessory="none" />
      </SettingsGroup>,
    )

    expect(container.querySelectorAll('[data-separator]')).toHaveLength(2)
  })

  it('draws no separator for a single-row group', () => {
    const { container } = render(
      <SettingsGroup>
        <SettingsRow label="Language" accessory="none" />
      </SettingsGroup>,
    )

    expect(container.querySelectorAll('[data-separator]')).toHaveLength(0)
  })

  it('keeps every row reachable', () => {
    render(
      <SettingsGroup>
        <SettingsRow label="Language" accessory="none" />
        <SettingsRow label="Theme" accessory="none" />
      </SettingsGroup>,
    )

    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
  })
})
