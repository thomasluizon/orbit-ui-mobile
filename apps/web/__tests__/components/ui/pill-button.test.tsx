import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PillButton } from '@/components/ui/pill-button'

describe('PillButton', () => {
  describe('small touch targets in Chromium', () => {
    let browser: Browser
    let stylesheet: string

    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
      const font = readFileSync(require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')).toString('base64')
      stylesheet = `${compiled.css}
        @font-face { font-family: TestGeist; font-weight: 500; src: url(data:font/ttf;base64,${font}); }
        :root { --font-sans: TestGeist; }
        body { padding: 48px; }`
      browser = await chromium.launch({ channel: 'chrome' })
    })

    afterAll(async () => { await browser.close() })

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
