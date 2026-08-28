import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Proposed } from '@/components/ui/proposed'

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
