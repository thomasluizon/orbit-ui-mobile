import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { hasExplicitTextColorClass, Proposed } from '@/components/ui/proposed'

function CompositeValue() {
  return (
    <span data-composite-value="" style={{ color: 'var(--fg-1)' }}>
      Composite value
      <span data-composite-meta="" style={{ color: 'var(--fg-3)' }}>Composite meta</span>
    </span>
  )
}

function UnstyledCompositeValue({ marker }: Readonly<{ marker: string }>) {
  return <span className="text-sm" data-unstyled-composite={marker}>Unstyled composite</span>
}

const ambientForeground = 'rgb(18, 19, 21)'
const proposedForeground = 'var(--fg-3)'

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
    expect(wrapper.className).not.toContain('text-[var(--fg-3)]')
    expect(screen.getByText('Suggested value')).toHaveStyle({ color: proposedForeground })
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

  it('renders unstyled composite output identically inside and outside', () => {
    const { container } = render(
      <div style={{ color: ambientForeground }}>
        <UnstyledCompositeValue marker="outside" />
        <Proposed proposed scope="row" label="Proposed by Astra">
          <UnstyledCompositeValue marker="inside" />
        </Proposed>
      </div>,
    )

    const outside = container.querySelector<HTMLElement>('[data-unstyled-composite="outside"]')!
    const inside = container.querySelector<HTMLElement>('[data-unstyled-composite="inside"]')!
    expect({
      className: inside.className,
      computedColor: getComputedStyle(inside).color,
      inlineStyle: inside.getAttribute('style'),
    }).toEqual({
      className: outside.className,
      computedColor: getComputedStyle(outside).color,
      inlineStyle: outside.getAttribute('style'),
    })
    expect(getComputedStyle(inside).color).toBe(ambientForeground)
  })

  it('tints nested unstyled text through containers, fragments, and arrays', () => {
    const { container } = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <>
          <section>
            <div><span data-nested-value="">Nested value</span></div>
          </section>
          {[
            <p data-fragment-value="" key="paragraph">Fragment value</p>,
            <label data-array-value="" key="label">Array value</label>,
          ]}
        </>
      </Proposed>,
    )

    expect(container.querySelector<HTMLElement>('[data-nested-value]')).toHaveStyle({ color: proposedForeground })
    expect(container.querySelector<HTMLElement>('[data-fragment-value]')).toHaveStyle({ color: proposedForeground })
    expect(container.querySelector<HTMLElement>('[data-array-value]')).toHaveStyle({ color: proposedForeground })
  })

  it('keeps an explicit intrinsic color and stops the walk there', () => {
    const explicitForeground = 'rgb(1, 2, 3)'
    const { container } = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <div data-explicit-value="" style={{ color: explicitForeground }}>
          <span data-explicit-child="">Explicit value</span>
        </div>
      </Proposed>,
    )

    expect(container.querySelector<HTMLElement>('[data-explicit-value]')).toHaveStyle({ color: explicitForeground })
    expect(container.querySelector<HTMLElement>('[data-explicit-child]')!.style.color).toBe('')
  })

  it('keeps a class-based status foreground as the exact effective color', () => {
    const statusForeground = 'rgb(174, 51, 64)'
    const { container } = render(
      <>
        <style>{`.text-\\[var\\(--status-bad-text\\)\\] { color: ${statusForeground}; }`}</style>
        <Proposed proposed scope="row" label="Proposed by Astra">
          <span className="text-[var(--status-bad-text)]" data-status-value="">Status value</span>
        </Proposed>
      </>,
    )
    const statusValue = container.querySelector<HTMLElement>('[data-status-value]')!

    expect(statusValue.className).toBe('text-[var(--status-bad-text)]')
    expect(statusValue.style.color).toBe('')
    expect(getComputedStyle(statusValue).color).toBe(statusForeground)
  })

  it('leaves the explicit token colors owned by a composite child unaltered', () => {
    const { container } = render(
      <Proposed proposed scope="row" label="Proposed by Astra">
        <CompositeValue />
      </Proposed>,
    )

    expect(container.querySelector<HTMLElement>('[data-composite-value]')!.style.color).toBe('var(--fg-1)')
    expect(container.querySelector<HTMLElement>('[data-composite-meta]')!.style.color).toBe('var(--fg-3)')
  })

  it('wraps raw string and number children in fg3 spans', () => {
    const { container } = render(
      <Proposed proposed scope="block" label="Proposed by Astra">
        {'Bare value'}
        {42}
      </Proposed>,
    )
    const wrapper = container.querySelector<HTMLElement>('[data-proposed]')!
    const wrappedValues = Array.from(wrapper.children) as HTMLElement[]

    expect(wrappedValues.map((element) => element.tagName)).toEqual(['SPAN', 'SPAN'])
    expect(wrappedValues.map((element) => element.textContent)).toEqual(['Bare value', '42'])
    expect(wrappedValues.map((element) => element.style.color)).toEqual([
      proposedForeground,
      proposedForeground,
    ])
  })

  it('tints an intrinsic text child without tinting its composite sibling', () => {
    const { container } = render(
      <div style={{ color: ambientForeground }}>
        <Proposed proposed scope="row" label="Proposed by Astra">
          <div>
            <span data-intrinsic-value="">Intrinsic value</span>
            <UnstyledCompositeValue marker="inside" />
          </div>
        </Proposed>
      </div>,
    )

    const intrinsic = container.querySelector<HTMLElement>('[data-intrinsic-value]')!
    const composite = container.querySelector<HTMLElement>('[data-unstyled-composite]')!
    expect(intrinsic.style.color).toBe(proposedForeground)
    expect(getComputedStyle(composite).color).toBe(ambientForeground)
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

describe('hasExplicitTextColorClass', () => {
  it.each([
    'text-[var(--fg-1)]',
    'text-[#b74e12]',
    'text-[rgb(174_51_64)]',
    'text-bg',
    'text-fg-1',
    'text-primary-soft',
    'text-status-bad-text',
    'text-white',
    'text-white/70',
    'hover:text-[var(--primary)]',
    'md:text-violet-500',
  ])('accepts the foreground utility %s', (className) => {
    expect(hasExplicitTextColorClass(className)).toBe(true)
  })

  it.each([
    'text-sm',
    'text-[12px]',
    'text-[length:var(--fs-sm)]',
    'text-left',
    'text-center',
    'text-right',
    'text-start',
    'text-balance',
    'text-ellipsis',
    'text-fluid-sm',
  ])('rejects the non-color text utility %s', (className) => {
    expect(hasExplicitTextColorClass(className)).toBe(false)
  })
})
