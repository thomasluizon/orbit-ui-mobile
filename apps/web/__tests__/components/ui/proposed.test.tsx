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
const proposedForegroundClass = 'text-[var(--fg-3)]'

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
    expect(wrapper.className).not.toContain(proposedForegroundClass)
    expect(screen.getByText('Suggested value')).toHaveClass(proposedForegroundClass)
    expect(screen.getByText('Suggested value')).not.toHaveAttribute('style')
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

    expect(container.querySelector<HTMLElement>('[data-nested-value]')).toHaveClass(proposedForegroundClass)
    expect(container.querySelector<HTMLElement>('[data-fragment-value]')).toHaveClass(proposedForegroundClass)
    expect(container.querySelector<HTMLElement>('[data-array-value]')).toHaveClass(proposedForegroundClass)
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

  it('wraps raw string and number children in class-tinted fg3 spans', () => {
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
    expect(wrappedValues.map((element) => element.className)).toEqual([
      proposedForegroundClass,
      proposedForegroundClass,
    ])
    expect(wrappedValues.map((element) => element.getAttribute('style'))).toEqual([null, null])
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
    expect(intrinsic).toHaveClass(proposedForegroundClass)
    expect(intrinsic.style.color).toBe('')
    expect(getComputedStyle(composite).color).toBe(ambientForeground)
  })

  it('uses fg3 in the base state while preserving a conditional foreground variant', () => {
    const proposedForeground = 'rgb(113, 117, 125)'
    const hoverForeground = 'rgb(241, 242, 244)'
    const { container } = render(
      <>
        <style>{`
          .text-\\[var\\(--fg-3\\)\\] { color: ${proposedForeground}; }
          .hover\\:text-\\[var\\(--fg-1\\)\\]:hover { color: ${hoverForeground}; }
        `}</style>
        <Proposed proposed scope="row" label="Proposed by Astra">
          <span className="hover:text-[var(--fg-1)]" data-conditional-value="">
            Conditional value
          </span>
        </Proposed>
      </>,
    )
    const conditionalValue = container.querySelector<HTMLElement>('[data-conditional-value]')!
    const stylesheet = container.querySelector<HTMLStyleElement>('style')!.sheet!
    const hoverRule = Array.from(stylesheet.cssRules).find(
      (rule) => rule instanceof CSSStyleRule && rule.selectorText.endsWith(':hover'),
    ) as CSSStyleRule | undefined

    expect(conditionalValue.className).toBe(`hover:text-[var(--fg-1)] ${proposedForegroundClass}`)
    expect(conditionalValue.style.color).toBe('')
    expect(getComputedStyle(conditionalValue).color).toBe(proposedForeground)
    expect(hoverRule?.selectorText).toBe('.hover\\:text-\\[var\\(--fg-1\\)\\]:hover')
    expect(hoverRule?.style.color).toBe(hoverForeground)
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
    'hover:text-[var(--primary)]',
    'focus:text-status-bad-text',
    'md:text-violet-500',
    'dark:group-hover:text-white',
  ])('rejects the conditional or non-color text utility %s', (className) => {
    expect(hasExplicitTextColorClass(className)).toBe(false)
  })
})
