import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SelectionIndicator } from '@/components/ui/selection-indicator'

const css = readFileSync(resolve('app/globals.css'), 'utf8')

it('draws the calendar ring from the stylesheet, so a flight of the indicator never rewrites it', () => {
  const { container } = render(<SelectionIndicator id="ring" calendar />)
  const indicator = container.querySelector<HTMLElement>('[data-selection-motion]')!
  expect(indicator).toHaveAttribute('data-selection-ring')
  expect(indicator.style.boxShadow).toBe('')
  expect(css).toMatch(/\[data-selection-motion\]\[data-selection-ring\]\s*\{\s*box-shadow:\s*var\(--day-selection-ring, inset 0 0 0 2px var\(--primary\)\);/)
})

it('keeps the focused day ring rule: a focused day removes only its own selection ring', () => {
  expect(css).toMatch(/\.orbit-day-target:focus-visible\s*\{[^}]*--day-selection-ring:\s*none;/)
})

it('gives the plain selection indicator no ring', () => {
  const { container } = render(<SelectionIndicator id="plain" />)
  const indicator = container.querySelector<HTMLElement>('[data-selection-motion]')!
  expect(indicator).not.toHaveAttribute('data-selection-ring')
})
