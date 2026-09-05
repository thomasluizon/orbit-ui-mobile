import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PillButton } from '@/components/ui/pill-button'

describe('PillButton', () => {
  it.each([false, true])('attaches a centered 44px expansion rule without growing the small button (iconOnly: %s)', (iconOnly) => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const targetRules = css.match(/\.touch-target(?:::before)?\s*\{[^}]*\}/g)
    expect(targetRules).toHaveLength(2)
    const { container } = render(<>
      <style>{targetRules!.join('\n')}</style>
      {iconOnly ? <PillButton size="sm" iconOnly label="Small"><span /></PillButton> : <PillButton size="sm">Small</PillButton>}
    </>)
    const button = screen.getByRole('button', { name: 'Small' })
    const rules = Array.from(container.querySelector('style')!.sheet!.cssRules) as CSSStyleRule[]
    const expansion = rules.find((rule) => rule.selectorText.endsWith('::before') && button.matches(rule.selectorText.replace('::before', '')))

    expect(getComputedStyle(button).position).toBe('relative')
    expect(button).toHaveStyle({ height: '40px' })
    if (iconOnly) expect(button).toHaveStyle({ width: '40px' })
    expect(expansion).toBeDefined()
    expect(expansion!.style.getPropertyValue('content')).toBe('""')
    expect(expansion!.style.getPropertyValue('position')).toBe('absolute')
    for (const edge of ['top', 'bottom', 'left', 'right']) {
      expect(expansion!.style.getPropertyValue(edge)).toBe('calc(50% - 22px)')
    }
    expect(expansion!.style.getPropertyValue('pointer-events')).not.toBe('none')
  })

  it('renders its label', () => {
    render(<PillButton onClick={() => {}}>Continue</PillButton>)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('whitespace-nowrap')
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<PillButton onClick={onClick}>Continue</PillButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('submits an associated form outside the button subtree', () => {
    const onSubmit = vi.fn((event: React.SubmitEvent<HTMLFormElement>) => event.preventDefault())
    render(
      <>
        <form id="habit-form" onSubmit={onSubmit} />
        <PillButton formId="habit-form">Create</PillButton>
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <PillButton onClick={onClick} disabled>
        Continue
      </PillButton>,
    )
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('requires and exposes the name of an icon-only button', () => {
    render(
      <PillButton onClick={() => {}} iconOnly label="Open menu">
        <span data-testid="leading-node" />
      </PillButton>,
    )
    expect(screen.getByTestId('leading-node')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })

  it('no-ops clicks and exposes the loading state', () => {
    const onClick = vi.fn()
    render(
      <PillButton onClick={onClick} loading>
        Saving
      </PillButton>,
    )
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders all five variants', () => {
    render(
      <>
        <PillButton variant="secondary" onClick={() => {}}>
          Secondary
        </PillButton>
        <PillButton variant="ghost" onClick={() => {}}>
          Ghost
        </PillButton>
        <PillButton variant="destructive" onClick={() => {}}>
          Delete
        </PillButton>
        <PillButton variant="caution" onClick={() => {}}>
          Caution
        </PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Caution' })).toBeInTheDocument()
  })

  it('drives the pill height from the two-size scale', () => {
    render(
      <>
        <PillButton size="sm" onClick={() => {}}>
          Small
        </PillButton>
        <PillButton onClick={() => {}}>Medium</PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Small' })).toHaveStyle({ height: '40px' })
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveStyle({ height: '50px' })
  })
})
