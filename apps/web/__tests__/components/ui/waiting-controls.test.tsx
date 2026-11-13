import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { PillButton } from '@/components/ui/pill-button'
import { IconButton } from '@/components/ui/icon-button'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { CalendarSyncBoundary } from '@/components/calendar/calendar-sync-boundary'
import { Plus } from '@/components/ui/icons'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

const css = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'))

function expectSkeletonFace(control: HTMLElement) {
  const face = control.querySelector('[data-slot="skeleton-face"]')
  expect(face).toHaveAttribute('aria-hidden', 'true')
  expect(face).toHaveClass('absolute', 'inset-0', '-z-10', 'overflow-hidden', 'rounded-[inherit]')
  expect(face?.querySelector('.skeleton-pulse')).toHaveClass('bg-[var(--bg-well)]')
}

function expectNoSpinner(container: HTMLElement) {
  expect(container.querySelector('.animate-spin, .orbit-essential-loading, [role="progressbar"] svg')).toBeNull()
}

function expectWaiting(control: HTMLElement, name: string, container: HTMLElement) {
  expect(control).toHaveAccessibleName(name)
  expect(control).toBeDisabled()
  expect(control).toHaveAttribute('aria-busy', 'true')
  expectSkeletonFace(control)
  expectNoSpinner(container)
}

function renderedControl(element: ReactElement, role: 'button' | 'checkbox', name: string) {
  const view = render(element)
  return { view, control: screen.getByRole(role, { name }) }
}

describe('a control that waits for its own request', () => {
  it.each(['primary', 'secondary', 'ghost', 'destructive', 'caution'] as const)('keeps the %s pill label and size on the skeleton face', (variant) => {
    const idle = render(<PillButton variant={variant} leadingIcon={<Plus size={16} data-testid="leading" />}>Save</PillButton>)
    const idleWidth = idle.container.querySelector('button')!.getAttribute('style')
    idle.unmount()
    const { view, control } = renderedControl(<PillButton variant={variant} loading leadingIcon={<Plus size={16} data-testid="leading" />}>Save</PillButton>, 'button', 'Save')
    expectWaiting(control, 'Save', view.container)
    expect(control.getAttribute('style')).toBe(idleWidth)
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByTestId('leading')).toBeInTheDocument()
    expect(control).toHaveClass('relative', 'isolate', 'bg-transparent', 'text-[var(--fg-1)]')
    expect(control).not.toHaveClass('disabled:opacity-40')
  })

  it('keeps an icon-only action glyph and a retained leading glyph, with no trailing status slot', () => {
    const icon = renderedControl(<IconButton label="Suggest" loading><Plus size={20} data-testid="glyph" /></IconButton>, 'button', 'Suggest')
    expectWaiting(icon.control, 'Suggest', icon.view.container)
    expect(screen.getByTestId('glyph')).toBeInTheDocument()
    icon.view.unmount()
    const retained = renderedControl(<PillButton variant="ghost" retainLeadingIcon leadingIcon={<Plus size={16} />} loading focusableWhenLoading>Ask</PillButton>, 'button', 'Ask')
    expect(retained.control).toHaveAttribute('aria-busy', 'true')
    expect(retained.control).toHaveAttribute('aria-disabled', 'true')
    expectSkeletonFace(retained.control)
    expect(retained.control.querySelectorAll(':scope > span[aria-hidden="true"]:not([data-slot])')).toHaveLength(0)
  })

  it.each(['dark', 'light'] as const)('reads the waiting label above 4.5:1 at both ends of the skeleton pulse in %s', (mode) => {
    const tokens = resolveWebThemeVariables('purple', mode)
    expect(contrastOnSurface(tokens['--fg-1']!, [tokens['--bg']!, tokens['--bg-well']!])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(tokens['--fg-1']!, [tokens['--bg']!])).toBeGreaterThanOrEqual(4.5)
  })

  it('shows the skeleton face in the checkbox and keeps a checked state visible on it', () => {
    const { view, control } = renderedControl(<Checkbox checked onChange={vi.fn()} label="Done" loading />, 'checkbox', 'Done')
    expectWaiting(control, 'Done', view.container)
    const box = control.querySelector('[data-slot="checkbox-box"]')!
    expect(box).toHaveClass('relative', 'isolate', 'bg-transparent')
    expect(box).not.toHaveAttribute('data-filled')
    expect(box.querySelector('svg.tabler-icon-check, svg')).toHaveClass('text-[var(--fg-1)]')
    expect(control).not.toHaveClass('disabled:opacity-60')
  })

  it.each([
    ['inset', <CheckRow key="inset" label="Water" checked={false} onChange={vi.fn()} loading />],
    ['column', <CheckRow key="column" placement="column" label="Water" checked onChange={vi.fn()} loading />],
    ['personal', <CheckRow key="personal" textMode="personal" onOpenLabel={vi.fn()} label="Water" checked={false} onChange={vi.fn()} loading />],
    ['calendar day', <CheckRow key="calendar" textMode="personal" variant="calendar-day" onOpenLabel={vi.fn()} label="Water" checked={false} onChange={vi.fn()} loading />],
  ])('keeps the %s check row label and shows the skeleton face on its control', (_placement, element) => {
    const view = render(element)
    const control = screen.getByRole('checkbox', { name: 'Water' })
    expect(control).toBeDisabled()
    expect(control).toHaveAttribute('aria-busy', 'true')
    expect(control).not.toHaveClass('disabled:opacity-60')
    expectSkeletonFace(control.querySelector('[data-slot="skeleton-face"]')!.parentElement!)
    expect(screen.getAllByText('Water').length).toBeGreaterThan(0)
    expectNoSpinner(view.container)
  })

  it('shows the skeleton face behind the calendar sync glyph while the sync runs', async () => {
    let finish!: () => void
    const onSyncNow = vi.fn(() => new Promise<void>((done) => { finish = done }))
    const view = render(<CalendarSyncBoundary isConnected hasProAccess locale="en" autoSyncState={undefined} onAutoSyncChange={vi.fn()} onSyncNow={onSyncNow} />)
    const control = screen.getByRole('button', { name: 'calendar.autoSync.syncNow' })
    await act(async () => { fireEvent.click(control) })
    expectWaiting(control, 'calendar.autoSync.syncNow', view.container)
    expect(control.querySelector('svg')).toBeInTheDocument()
    expect(control).not.toHaveClass('disabled:opacity-50')
    await act(async () => { finish() })
    expect(control.querySelector('[data-slot="skeleton-face"]')).toBeNull()
  })

  it('holds the still skeleton tone under reduced motion and keeps no looping loader rule', () => {
    const reduced: string[] = []
    css.walkAtRules('media', (media) => {
      if (media.params !== '(prefers-reduced-motion: reduce)') return
      media.walkRules((rule) => { if (rule.selector.includes('*')) rule.walkDecls((declaration) => { reduced.push(`${declaration.prop}: ${declaration.value}`) }) })
    })
    expect(reduced).toEqual(expect.arrayContaining(['animation-duration: 0.01ms', 'animation-iteration-count: 1']))
    const keyframes: string[] = []
    css.walkAtRules('keyframes', (rule) => { keyframes.push(rule.params) })
    expect(keyframes.filter((name) => /spin|rotate/.test(name))).toEqual([])
    const loaders: string[] = []
    css.walkRules((rule) => { if (/essential-loading|animate-spin/.test(rule.selector)) loaders.push(rule.selector) })
    expect(loaders).toEqual([])
    const pulse: string[] = []
    css.walkRules('.skeleton-pulse', (rule) => { rule.walkDecls('animation', (declaration) => { pulse.push(declaration.value) }) })
    expect(pulse).toEqual(['skeleton-pulse calc(var(--dur-slow) * 4) ease-in-out var(--skeleton-pulse-iterations)'])
  })
})
