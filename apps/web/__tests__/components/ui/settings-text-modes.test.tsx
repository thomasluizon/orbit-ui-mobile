import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListRow } from '@/components/ui/list-row'

describe.each([['ListRow', ListRow]] as const)('%s typed disclosure', (_name, Row) => {
  it('reveals the full typed value in one tap and lets it collapse again', () => {
    const title = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos'
    render(<Row title={title} textMode="personal" chevron={false} />)
    const row = screen.getByRole('button', { name: title })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(row.parentElement!.querySelector('[data-slot="list-row-title"]')).toHaveTextContent(title)
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })
})
