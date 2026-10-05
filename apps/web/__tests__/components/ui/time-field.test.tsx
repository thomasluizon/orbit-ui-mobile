import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

let uses24HourClock = true

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => (uses24HourClock ? 'pt-BR' : 'en-US'),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { uses24HourClock } }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { TimeField } from '@/components/ui/time-field'

/** The trigger is labelled by its current value, so open it by position. */
function openPicker() {
  fireEvent.click(screen.getAllByRole('button')[0]!)
}

function pickOption(columnLabel: string, label: string) {
  const column = screen.getByRole('radiogroup', { name: columnLabel })
  fireEvent.click(within(column).getByRole('radio', { name: label }))
}

describe('TimeField', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  }, 30_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => vi.unstubAllGlobals())
  it.each([
    { mode: 'dark', hourCycle: 'h23' },
    { mode: 'light', hourCycle: 'h23' },
    { mode: 'dark', hourCycle: 'h12' },
    { mode: 'light', hourCycle: 'h12' },
  ] as const)('keeps selected values tinted and ringed at rest, hover and press in $mode ($hourCycle)', async ({ mode, hourCycle }) => {
    uses24HourClock = hourCycle === 'h23'
    const { container } = render(<TimeField value="21:00" onChange={vi.fn()} />)
    openPicker()
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    try {
      await page.setContent(`<style>${stylesheet} :root { ${variables} }</style>${container.innerHTML}`)
      const expected = await page.evaluate(() => {
        const probe = document.createElement('span')
        document.body.append(probe)
        probe.style.backgroundColor = 'var(--bg-hover)'
        probe.style.color = 'var(--fg-1)'
        const background = getComputedStyle(probe).backgroundColor
        const color = getComputedStyle(probe).color
        const primaryProbe = document.createElement('span')
        primaryProbe.style.color = 'var(--primary)'
        document.body.append(primaryProbe)
        const primary = getComputedStyle(primaryProbe).color
        primaryProbe.remove()
        probe.remove()
        return { background, color, primary }
      })
      const selected = page.locator('[role="radio"][aria-checked="true"]')
      expect(await selected.count()).toBe(hourCycle === 'h23' ? 2 : 3)
      for (const option of await selected.all()) {
        const readStyle = () => option.evaluate((element) => {
          const style = getComputedStyle(element)
          return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow, radius: style.borderRadius, height: element.getBoundingClientRect().height }
        })
        const rest = await readStyle()
        expect(rest).toMatchObject({ background: expected.background, color: expected.color, radius: '12px' })
        expect(rest.height).toBeGreaterThanOrEqual(48)
        expect(rest.shadow).toContain(`${expected.primary} 0px 0px 0px 2px inset`)
        expect(await option.getAttribute('data-focus-on-primary')).toBeNull()
        await option.hover()
        await expect.poll(readStyle).toEqual(rest)
        await page.mouse.down()
        try { expect(await readStyle()).toEqual(rest) } finally { await page.mouse.up() }
        await page.keyboard.press('Tab')
        await option.focus()
        expect(await option.evaluate((element) => {
          const style = getComputedStyle(element)
          return { color: style.outlineColor, width: style.outlineWidth, offset: style.outlineOffset }
        })).toEqual({ color: expected.color, width: '2px', offset: '-4px' })
        await page.mouse.move(0, 0)
      }
      const unselected = page.getByRole('radiogroup', { name: 'common.hours' }).getByRole('radio', { name: '07', exact: true })
      await unselected.hover()
      await expect.poll(() => unselected.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expected.background)
      expect(await unselected.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none')
    } finally { await page.close() }
  })

  it('offers every minute, so an odd minute like 07:13 is selectable in a 24-hour locale', () => {
    uses24HourClock = true
    const onChange = vi.fn()
    render(<TimeField value="14:30" onChange={onChange} />)

    openPicker()
    pickOption('common.hours', '07')
    pickOption('common.minutes', '13')
    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.done'])
    expectSmallSheetActions()
    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))

    expect(onChange).toHaveBeenCalledWith('07:13')
  })

  it('keeps the canonical HH:MM value for an odd minute picked in a 12-hour locale', () => {
    uses24HourClock = false
    const onChange = vi.fn()
    render(<TimeField value="14:30" onChange={onChange} />)

    openPicker()
    pickOption('common.hours', '09')
    pickOption('common.minutes', '45')
    pickOption('common.amPm', 'PM')
    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))

    expect(onChange).toHaveBeenCalledWith('21:45')
  })

  it('opens on the persisted odd minute rather than snapping it to a half hour', () => {
    uses24HourClock = true
    render(<TimeField value="07:15" onChange={vi.fn()} />)

    openPicker()

    const hours = screen.getByRole('radiogroup', { name: 'common.hours' })
    const minutes = screen.getByRole('radiogroup', { name: 'common.minutes' })
    expect(within(hours).getByRole('radio', { name: '07' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(minutes).getByRole('radio', { name: '15' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('offers all sixty minutes, not a half-hour subset', () => {
    uses24HourClock = true
    render(<TimeField value="07:15" onChange={vi.fn()} />)

    openPicker()

    const minutes = screen.getByRole('radiogroup', { name: 'common.minutes' })
    expect(within(minutes).getAllByRole('radio')).toHaveLength(60)
  })

  it('uses one tab stop and wraps arrow selection within each time column', () => {
    uses24HourClock = true
    const onChange = vi.fn()
    render(<TimeField value="14:30" onChange={onChange} />)

    openPicker()
    const hours = screen.getByRole('radiogroup', { name: 'common.hours' })
    const options = within(hours).getAllByRole('radio')
    const selected = within(hours).getByRole('radio', { name: '14' })

    expect(options.filter((option) => option.tabIndex === 0)).toEqual([selected])
    selected.focus()
    fireEvent.keyDown(selected, { key: 'End' })
    const lastHour = within(hours).getByRole('radio', { name: '23' })
    expect(lastHour).toHaveFocus()
    expect(lastHour).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    const firstHour = within(hours).getByRole('radio', { name: '00' })
    expect(firstHour).toHaveFocus()
    expect(firstHour).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('00:30')
  })
})
