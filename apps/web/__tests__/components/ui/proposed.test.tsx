import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Proposed } from '@/components/ui/proposed'

function CompositeValue() {
  return <span data-composite-value="">Composite value</span>
}

describe('Proposed on web', () => {
  it('renders the labelled dashed treatment at the scope radius', () => {
    render(
      <Proposed proposed scope="field" label="Proposed by Astra">
        <span>Suggested value</span>
      </Proposed>,
    )
    const wrapper = screen.getByRole('group', { name: 'Proposed by Astra' })
    expect(wrapper).toHaveAttribute('data-proposed')
    expect(wrapper).toHaveStyle({ borderRadius: '12px' })
    expect(wrapper.className).toContain('border-dashed')
    expect(wrapper.className).toContain('text-[var(--fg-3)]')
  })

  it('returns the child untouched when the state is off', () => {
    const plain = render(<span data-child="">Value</span>)
    const expected = plain.container.innerHTML
    plain.unmount()

    const off = render(
      <Proposed proposed={false} scope="block" label="Proposed by Astra">
        <span data-child="">Value</span>
      </Proposed>,
    )
    expect(off.container.innerHTML).toBe(expected)
    expect(off.container.querySelector('[data-proposed]')).toBeNull()
  })

  it('gives unstyled text fg3 while an explicit child color wins', () => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = String.raw`
      .text-\[var\(--fg-3\)\] { color: var(--fg-3); }
    `
    document.head.append(stylesheet)

    try {
      const { container } = render(
        <Proposed proposed scope="row" label="Proposed by Astra">
          <CompositeValue />
          <span data-explicit-value="" style={{ color: 'rgb(1, 2, 3)' }}>Explicit value</span>
        </Proposed>,
      )

      const compositeValue = container.querySelector('[data-composite-value]')!
      const explicitValue = container.querySelector('[data-explicit-value]')!
      expect(getComputedStyle(compositeValue).color).toBe('var(--fg-3)')
      expect(getComputedStyle(explicitValue).color).toBe('rgb(1, 2, 3)')
    } finally {
      stylesheet.remove()
    }
  })

  it('depends only on caller words, not locale defaults', () => {
    const { container, rerender } = render(
      <Proposed proposed scope="row" label="Suggested">
        <span>Caller words</span>
      </Proposed>,
    )
    const english = container.innerHTML
    rerender(
      <Proposed proposed scope="row" label="Suggested">
        <span>Caller words</span>
      </Proposed>,
    )
    expect(container.innerHTML).toBe(english)
  })
})
