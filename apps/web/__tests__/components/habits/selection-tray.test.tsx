import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { SelectionTray } from '@/components/habits/selection-tray'
import { HabitListEmptyState } from '@/components/habits/habit-list/empty-state'

function renderBar(overrides: Partial<Parameters<typeof SelectionTray>[0]> = {}) {
  const props = {
    selectedCount: 2,
    allSelected: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onBulkLog: vi.fn(),
    onBulkSkip: vi.fn(),
    onBulkDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<SelectionTray {...props} />)
  return props
}

describe('SelectionTray', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('labels the action buttons with the selection-scoped accessible names', () => {
    renderBar()

    expect(screen.getByRole('button', { name: 'habits.bulkBar.log' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.bulkBar.skip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.bulkBar.delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument()
  })

  it('fires the bulk handlers when actions are clicked with a selection', () => {
    const props = renderBar({ selectedCount: 3 })

    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.log' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.skip' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.delete' }))

    expect(props.onBulkLog).toHaveBeenCalled()
    expect(props.onBulkSkip).toHaveBeenCalled()
    expect(props.onBulkDelete).toHaveBeenCalled()
  })

  it('disables log, skip, and delete when nothing is selected but keeps close active', () => {
    const props = renderBar({ selectedCount: 0 })

    const logButton = screen.getByRole('button', { name: 'habits.bulkBar.log' })
    const skipButton = screen.getByRole('button', { name: 'habits.bulkBar.skip' })
    const deleteButton = screen.getByRole('button', { name: 'habits.bulkBar.delete' })
    const closeButton = screen.getByRole('button', { name: 'common.cancel' })

    expect(logButton).toBeDisabled()
    expect(skipButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(closeButton).toBeEnabled()

    fireEvent.click(logButton)
    fireEvent.click(skipButton)
    fireEvent.click(deleteButton)

    expect(props.onBulkLog).not.toHaveBeenCalled()
    expect(props.onBulkSkip).not.toHaveBeenCalled()
    expect(props.onBulkDelete).not.toHaveBeenCalled()
  })

  it('explains the old-day limit while keeping bulk delete active', () => {
    const props = renderBar({ completionReadOnly: true })
    for (const label of ['habits.bulkBar.log', 'habits.bulkBar.skip']) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription('habits.todayBoundary.readOnly')
      fireEvent.click(button)
    }
    fireEvent.click(screen.getByRole('button', { name: 'habits.bulkBar.delete' }))
    expect(props.onBulkLog).not.toHaveBeenCalled()
    expect(props.onBulkSkip).not.toHaveBeenCalled()
    expect(props.onBulkDelete).toHaveBeenCalledOnce()
  })

  it('toggles between select-all and deselect-all', () => {
    const props = renderBar({ allSelected: false })

    fireEvent.click(screen.getByRole('button', { name: 'common.selectAll' }))
    expect(props.onSelectAll).toHaveBeenCalled()
  })

  it('offers deselect-all when everything is selected', () => {
    const props = renderBar({ allSelected: true })

    fireEvent.click(screen.getByRole('button', { name: 'common.deselectAll' }))
    expect(props.onDeselectAll).toHaveBeenCalled()
  })

  it('renders the selected count beside the digit-free suffix', () => {
    renderBar({ selectedCount: 7 })

    const bar = screen.getByTestId('bulk-action-bar')
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(bar.textContent).toContain('common.selectedSuffix')
  })
})

describe('SelectionTray painted targets in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('paints the secondary Today retry as a complete 44px target', async () => {
    const { container } = render(<HabitListEmptyState variant="secondary" title="Unable to load" description="" actionLabel="Retry" onAction={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
    try {
      const declarations = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${declarations}} *{transition:none !important}</style>${container.innerHTML}`)
      const retry = page.getByRole('button', { name: 'Retry', exact: true })
      const bounds = await retry.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(44)
      expect(bounds!.height).toBeGreaterThanOrEqual(44)
      await retry.hover()
      const fill = await retry.evaluate((element) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = 'var(--bg-hover)'
        element.append(probe)
        const expected = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { actual: getComputedStyle(element).backgroundColor, expected }
      })
      expect(fill.actual).toBe(fill.expected)
      await page.mouse.down()
      expect(await retry.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(fill.expected)
      await page.mouse.up()
    } finally { await page.close() }
  })

  it.each([{ allSelected: false, mode: 'dark' }, { allSelected: true, mode: 'dark' }, { allSelected: false, mode: 'light' }, { allSelected: true, mode: 'light' }] as const)('paints every 44px target with allSelected: $allSelected in $mode', async ({ allSelected, mode }) => {
    renderBar({ allSelected })
    const markup = screen.getByTestId('bulk-action-bar').outerHTML
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
    try {
      const declarations = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${declarations}} *{transition:none !important}</style>${markup}`)
      await page.getByTestId('bulk-action-bar').evaluate((element) => { element.style.transform = 'none' })
      const buttons = page.getByRole('button')
      expect(await buttons.count()).toBe(5)
      for (const button of await buttons.all()) {
        const bounds = await button.boundingBox()
        expect(bounds!.width).toBeGreaterThanOrEqual(44)
        expect(bounds!.height).toBeGreaterThanOrEqual(44)
        await button.hover()
        const fill = await button.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.backgroundColor = 'var(--bg-hover-opaque)'
          element.append(probe)
          const expected = getComputedStyle(probe).backgroundColor
          probe.remove()
          return { actual: getComputedStyle(element).backgroundColor, expected }
        })
        expect(fill.actual).toBe(fill.expected)
        await page.mouse.down()
        expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(fill.expected)
        await page.mouse.up()
      }
    } finally { await page.close() }
  })
})
