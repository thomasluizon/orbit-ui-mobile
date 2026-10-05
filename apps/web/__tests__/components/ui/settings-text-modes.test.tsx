import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'

describe.each([['SettingsRow', SettingsRow], ['SettingsGroupRow', SettingsGroupRow]] as const)('%s typed disclosure', (_name, Row) => {
  it('reveals the full typed value in one tap and lets it collapse again', () => {
    const title = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos'
    render(<Row label={title} textMode="personal" accessory="none" />)
    const row = screen.getByRole('button', { name: title })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(row.parentElement!.querySelector('[data-slot="settings-row-label"]')).toHaveTextContent(title)
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })
})
