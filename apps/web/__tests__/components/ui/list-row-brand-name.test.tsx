import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ListRow } from '@/components/ui/list-row'

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const)('a list row in $locale', ({ messages }) => {
  it.each([messages.about.featureGuide, messages.settings.orbitMotion.title])('keeps only the name Orbit out of a page translator in the title %s', (title) => {
    render(<ListRow textMode="label" compact wrapTitle title={title} accessibilityLabel={title} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: title })).toBeInTheDocument()
    const titleLine = document.querySelector('[data-slot="list-row-title"]')!
    expect(titleLine).toHaveTextContent(title)
    expect(titleLine).not.toHaveAttribute('translate')
    expect([...titleLine.querySelectorAll('[translate="no"]')].map((node) => node.textContent)).toEqual(['Orbit'])
  })

  it('keeps only the name Orbit out of a page translator in the description', () => {
    render(<ListRow textMode="label" title={messages.about.support} description={messages.habits.noHabitsBody} onClick={vi.fn()} />)
    const description = document.querySelector('[data-slot="list-row-description"]')!
    expect(description).toHaveTextContent(messages.habits.noHabitsBody)
    expect(description).not.toHaveAttribute('translate')
    expect([...description.querySelectorAll('[translate="no"]')].map((node) => node.textContent)).toEqual(['Orbit'])
  })

  it('leaves a title with no Orbit in it free to translate', () => {
    render(<ListRow textMode="label" compact title={messages.about.support} onClick={vi.fn()} />)
    expect(document.querySelector('[data-slot="list-row-title"]')).not.toHaveAttribute('translate')
    expect(document.querySelector('[data-slot="list-row-title"] [translate="no"]')).toBeNull()
  })
})
