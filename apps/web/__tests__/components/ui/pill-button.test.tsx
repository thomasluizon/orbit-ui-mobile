import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PillButton, PillLink } from '@/components/ui/pill-button'
import { contrastOnSurface, withAlpha } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import {
  closeChrome,
  registerChromeLaunchHook,
  type Browser,
  type BrowserLaunch,
} from '@/__tests__/support/chromium'

describe('PillButton', () => {
  describe('small touch targets in Chromium', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string

    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await browserLaunch
    })

    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
      const font = readFileSync(require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')).toString('base64')
      stylesheet = `${compiled.css}
        @font-face { font-family: TestGeist; font-weight: 500; src: url(data:font/ttf;base64,${font}); }
        :root { --font-sans: TestGeist; }
        body { padding: 48px; }`
    })

    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each([
      { label: 'Continue', iconOnly: false, narrow: false },
      { label: 'i', iconOnly: false, narrow: true },
      { label: 'Open menu', iconOnly: true, narrow: true },
    ])('preserves the visible box and expands the target: $label', async ({ label, iconOnly, narrow }) => {
      const { container } = render(iconOnly
        ? <PillButton size="sm" iconOnly label={label}><span /></PillButton>
        : <PillButton size="sm">{label}</PillButton>)
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await page.evaluate(() => document.fonts.ready)
        const measured = await page.evaluate(() => {
          const button = document.querySelector('button')!
          const bounds = button.getBoundingClientRect()
          const expansion = getComputedStyle(button, '::before')
          const left = Number.parseFloat(expansion.left)
          const right = Number.parseFloat(expansion.right)
          const top = Number.parseFloat(expansion.top)
          const bottom = Number.parseFloat(expansion.bottom)
          const visible = { width: bounds.width, height: bounds.height }
          const target = { width: Number.parseFloat(expansion.width), height: Number.parseFloat(expansion.height), left, right, top, bottom }
          const hits = ([
            [bounds.x + left + 0.25, bounds.y + top + 0.25],
            [bounds.right - right - 0.25, bounds.bottom - bottom - 0.25],
          ] as const).map(([x, y]) => button.contains(document.elementFromPoint(x, y)))
          button.classList.remove('touch-target')
          const original = button.getBoundingClientRect()
          return { visible, target, hits, original: { width: original.width, height: original.height } }
        })
        expect(measured.visible).toEqual(measured.original)
        expect(measured.visible.height).toBe(40)
        if (iconOnly) expect(measured.visible.width).toBe(40)
        if (narrow) expect(measured.visible.width).toBeLessThan(44)
        else expect(measured.visible.width).toBeGreaterThan(44)
        expect(measured.target.width).toBeCloseTo(Math.max(44, measured.visible.width), 1)
        expect(measured.target.height).toBe(44)
        expect(measured.target.left).toBeCloseTo(narrow ? (measured.visible.width - 44) / 2 : 0, 1)
        expect(measured.target.right).toBeCloseTo(measured.target.left, 1)
        expect(measured.target.top).toBe(-2)
        expect(measured.target.bottom).toBe(-2)
        expect(measured.hits).toEqual([true, true])
      } finally {
        await page.close()
      }
    })
  })

  it('renders its label', () => {
    render(<PillButton onClick={() => {}}>Continue</PillButton>)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('whitespace-nowrap')
  })

  it('gives pill links the interactive states their button variants expose', () => {
    render(
      <>
        <PillLink href="/primary">Primary</PillLink>
        <PillLink href="/secondary" variant="secondary">Secondary</PillLink>
        <PillLink href="/ghost" variant="ghost">Ghost</PillLink>
      </>,
    )

    expect(screen.getByRole('link', { name: 'Primary' })).toHaveClass(
      'hover:bg-[var(--primary-hover)]',
      'active:scale-[0.96]',
    )
    expect(screen.getByRole('link', { name: 'Secondary' })).toHaveClass(
      'hover:opacity-90',
      'active:scale-[0.96]',
      'active:opacity-85',
    )
    expect(screen.getByRole('link', { name: 'Ghost' })).toHaveClass(
      'hover:bg-[var(--bg-card)]',
      'active:scale-[0.96]',
    )
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

  it('keeps its loading spinner perceivable under reduced motion', () => {
    render(<PillButton loading>Saving</PillButton>)
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button.querySelector('svg')).toHaveClass('orbit-essential-loading')

    const css = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'))
    const declarations: string[] = []
    css.walkAtRules('media', (media) => {
      if (media.params !== '(prefers-reduced-motion: reduce)') return
      media.walkRules('.orbit-essential-loading', (rule) => {
        rule.walkDecls((declaration) => {
          declarations.push(`${declaration.prop}: ${declaration.value}${declaration.important ? ' !important' : ''}`)
        })
      })
    })
    expect(declarations).toEqual([
      'animation-duration: 3s !important',
      'animation-iteration-count: infinite !important',
    ])
  })

  it('uses separate hover color and interruptible press transform timings', () => {
    render(<PillButton onClick={() => {}}>Continue</PillButton>)
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toHaveClass('orbit-pill-action', 'enabled:active:scale-[0.96]')

    const css = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'))
    const transitions: string[] = []
    css.walkRules('.orbit-pill-action', (rule) => {
      rule.walkDecls('transition', (declaration) => { transitions.push(declaration.value) })
    })
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toContain('background-color var(--dur-hover-control) var(--ease-standard)')
    expect(transitions[0]).toContain('transform var(--dur-1) var(--ease-out)')
  })

  it.each(['dark', 'light'] as const)('keeps loading text and focus visible in %s', (mode) => {
    render(<PillButton loading>Saving</PillButton>)
    const button = screen.getByRole('button', { name: 'Saving' })
    const label = screen.getByText('Saving')
    const tokens = resolveWebThemeVariables('purple', mode)

    expect(label).not.toHaveClass('opacity-60')
    expect(contrastOnSurface(tokens['--fg-on-primary']!, [tokens['--primary']!])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(tokens['--primary']!, [tokens['--bg']!])).toBeGreaterThanOrEqual(3)
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it.each(['dark', 'light'] as const)('keeps the destructive hover foreground legible in %s', (mode) => {
    render(<PillButton variant="destructive">Delete</PillButton>)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveClass('enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))]')
    const tokens = resolveWebThemeVariables('purple', mode)
    const fill = tokens['--status-bad']!
    const hover = withAlpha(tokens['--fg-1']!, 0.15)
    expect(contrastOnSurface(tokens['--fg-on-bad']!, [fill, hover])).toBeGreaterThanOrEqual(4.5)
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
