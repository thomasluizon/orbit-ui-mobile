import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, fireEvent } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { neutralColors } from '@orbit/shared/theme'
import { contrastOnSurface, controlContrast } from '@orbit/shared/__tests__/contrast'
import { ShellWide } from '@/components/shell/shell-wide'
import { StatusDot } from '@/components/ui/status-dot'
import { HabitLogButton } from '@/components/habits/habit-log-button'
import { DateField } from '@/components/ui/date-field'
import { DayCell } from '@/components/dates/day-cell'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { Menu } from '@/components/ui/menu'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))

const cases = [
  { name: 'colored row', element: <ListRow title="Delete" danger onClick={() => {}} trailing={<><span style={{ color: 'var(--primary-text)' }}>Accent</span><span style={{ color: 'var(--status-overdue-text)' }}>Overdue</span></>} /> },
  { name: 'destructive menu', element: <Menu open presentation="sheet" items={[{ id: 'delete', label: 'Delete', destructive: true }]} />, selector: '[role="menuitem"]' },
  { name: 'checked row', element: <CheckRow label="Checked" checked description="Description" value="Value" onChange={() => {}} /> },
  { name: 'row error', element: <CheckRow label="Checked" checked error="Error" onChange={() => {}} /> },
  { name: 'personal row error', element: <CheckRow label="Personal" textMode="personal" onOpenLabel={() => {}} checked error="Error" value="Value" onChange={() => {}} /> },
  { name: 'list row', element: <ListRow title="Delete" danger description="Description" value="Value" onClick={() => {}} /> },
  { name: 'settings row', element: <SettingsRow label="Delete" danger desc="Description" value="Value" onClick={() => {}} /> },
  { name: 'settings group row', element: <SettingsGroupRow label="Preferences" hint="Value" onClick={() => {}} /> },
  { name: 'settings group value', element: <SettingsGroup items={[{ label: 'Preferences', value: 'Value', onClick: () => {} }]} /> },
  { name: 'inactive tab', element: <BottomTabBar label="Navigation" activeId="other" items={[{ id: 'today', label: 'Today' }]} onSelect={() => {}} /> },
]

describe('rendered light hover contrast', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['light', 'dark'].flatMap((mode) => ['hover', 'press'].map((phase) => ({ mode: mode as 'light' | 'dark', phase }))))('keeps the status dot $phase paint stack visible in $mode', async ({ mode, phase }) => {
    const { container, unmount } = render(<StatusDot state="empty" size={30} ariaLabel="Log habit" onToggle={() => {}} />)
    const page = await browser.newPage({ viewport: { width: 600, height: 900 }, reducedMotion: 'reduce', hasTouch: phase === 'press' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet}</style><body style="background:var(--bg)"><div style="background:var(--bg-card)">${container.innerHTML}</div></body></html>`)
      const button = page.getByRole('button', { name: 'Log habit' })
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(phase === 'hover')
      const measure = () => button.evaluate((control) => {
        const dot = control.querySelector('span')!
        const parent = getComputedStyle(control)
        const graphic = getComputedStyle(dot)
        return { fill: parent.backgroundColor, opacity: Number(parent.opacity), graphicOpacity: Number(graphic.opacity), color: graphic.boxShadow.match(/rgba?\([^)]*\)/)![0] }
      })
      const resting = await measure()
      expect(controlContrast(resting.color, resting.fill, [neutralColors[mode].bg, neutralColors[mode].bgCard], resting.opacity, resting.graphicOpacity).graphic).toBeGreaterThanOrEqual(3)
      const bounds = await button.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(48)
      expect(bounds!.height).toBeGreaterThanOrEqual(48)
      await button.hover()
      await page.waitForTimeout(300)
      if (phase === 'press') { await page.mouse.down(); await page.waitForTimeout(300) }
      {
        const painted = await measure()
        const measured = controlContrast(painted.color, painted.fill, [neutralColors[mode].bg, neutralColors[mode].bgCard], painted.opacity, painted.graphicOpacity)
        expect(painted.color).toBe(resting.color)
        expect(measured.graphic).toBeGreaterThanOrEqual(3)
        expect(measured.step).toBeGreaterThanOrEqual(1.25)
      }
      await page.mouse.up()
      await page.mouse.move(0, 0)
      await page.waitForTimeout(300)
      expect(await measure()).toEqual(resting)
    } finally { await page.close(); unmount() }
  })

  it.each(['light', 'dark'].flatMap((mode) => [600, 1352].flatMap((width) => [false, true].map((icons) => ({ mode: mode as 'light' | 'dark', width, icons })))))('keeps selected tab hover and press-only text readable in $mode at $width with icons=$icons', async ({ mode, width, icons }) => {
    const items = ['today', 'calendar', 'progress', 'profile'].map((id) => ({ id, label: id, icon: icons ? () => <svg aria-hidden="true" width="24" height="24" /> : undefined }))
    const { container, unmount } = render(<BottomTabBar label="Navigation" activeId="today" items={items} onSelect={() => {}} />)
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><html class="${mode}" style="${variables}"><style>${stylesheet}</style><body style="background:var(--bg)">${container.innerHTML}</body></html>`)
      const tab = page.getByRole('button', { name: 'today', exact: true })
      const measure = () => tab.evaluate((button) => {
        const label = button.lastElementChild!
        const backgrounds: string[] = []
        for (let node: Element | null = label; node; node = node.parentElement) backgrounds.unshift(getComputedStyle(node).backgroundColor)
        return {
          color: getComputedStyle(label).color, backgrounds,
          raisedAccent: getComputedStyle(button).getPropertyValue('--primary-text').trim(),
          restingAccent: getComputedStyle(button).getPropertyValue('--primary-soft').trim(),
          hover: button.matches(':hover'), active: button.matches(':active'),
          current: button.getAttribute('aria-current'),
          fill: getComputedStyle(button).backgroundColor,
          indicatorFill: button.querySelector('[data-tab-indicator]') ? getComputedStyle(button.querySelector('[data-tab-indicator]')!).backgroundColor : null,
        }
      })
      const rgb = (hex: string) => `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`
      const resting = await measure()
      expect(resting.color).toBe(rgb(resting.restingAccent))
      expect(contrastOnSurface(resting.color, resting.backgrounds)).toBeGreaterThanOrEqual(4.5)
      const bounds = await tab.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(48)
      expect(bounds!.height).toBeGreaterThanOrEqual(48)
      await page.bringToFront()
      await tab.hover()
      await page.waitForTimeout(300)
      const hovered = await measure()
      expect(hovered).toMatchObject({ hover: true, active: false, current: 'page' })
      expect(hovered.color).toBe(rgb(hovered.raisedAccent))
      expect(hovered.fill.replaceAll(' ', '')).toBe(neutralColors[mode].bgHover.replaceAll(' ', ''))
      expect(contrastOnSurface(hovered.color, hovered.backgrounds)).toBeGreaterThanOrEqual(4.5)
      await page.mouse.down()
      expect(await measure()).toMatchObject({ color: hovered.color, backgrounds: hovered.backgrounds, hover: true, active: true, current: 'page' })
      await page.mouse.move(width - 1, 850)
      await page.waitForFunction(() => {
        const button = document.querySelector('[aria-current="page"]')!
        return button.matches(':active') && !button.matches(':hover')
      })
      await page.waitForTimeout(300)
      const pressed = await measure()
      expect(pressed).toMatchObject({ hover: false, active: true, current: 'page' })
      expect(pressed.color).toBe(rgb(pressed.raisedAccent))
      expect(pressed.fill).toBe('rgba(0, 0, 0, 0)')
      if (icons) expect(pressed.indicatorFill!.replaceAll(' ', '')).toBe(neutralColors[mode].bgHover.replaceAll(' ', ''))
      expect(contrastOnSurface(pressed.color, pressed.backgrounds)).toBeGreaterThanOrEqual(4.5)
      expect(await tab.boundingBox()).toEqual(bounds)
      await page.mouse.up()
      await page.waitForTimeout(300)
      expect(await measure()).toMatchObject({ color: resting.color, active: false, hover: false, current: 'page' })
    } finally { await page.close(); unmount() }
  })

  for (const width of [600, 1352]) {
    for (const progress of [undefined, 0]) {
      it(`keeps the habit logging track neutral at ${width} with progress ${progress}`, async () => {
        const { container, unmount } = render(<HabitLogButton label="Log habit" logged={false} progress={progress} onPress={() => {}} />)
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
        try {
          const variables = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
          await page.setContent(`<html class="light" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
          const track = progress === undefined ? page.locator('[data-status="empty"]') : page.locator('circle').first()
          const resting = await track.evaluate((node) => {
            const style = getComputedStyle(node)
            return node.tagName === 'circle' ? style.stroke : style.boxShadow.match(/rgba?\([^)]*\)/)![0]
          })
          for (const surface of [neutralColors.light.bg, neutralColors.light.bgCard]) {
            expect(contrastOnSurface(resting, [surface])).toBeGreaterThanOrEqual(3)
          }
          await page.locator('button').hover()
          await page.waitForFunction(() => getComputedStyle(document.querySelector('button')!).backgroundColor === 'rgba(9, 9, 11, 0.11)')
          const hovered = await track.evaluate((node) => {
            const style = getComputedStyle(node)
            return node.tagName === 'circle' ? style.stroke : style.boxShadow.match(/rgba?\([^)]*\)/)![0]
          })
          expect(hovered).toBe(resting)
          for (const surface of [neutralColors.light.bg, neutralColors.light.bgCard]) {
            expect(contrastOnSurface(hovered, [surface, neutralColors.light.bgHover])).toBeGreaterThanOrEqual(3)
          }
        } finally { await page.close(); unmount() }
      })
    }

    if (width === 1352) it('keeps the sidebar account email readable', async () => {
      const { container, unmount } = render(<ShellWide items={[]} activeId="today" navLabel="Navigation" account="Person" accountEmail="person@example.test" />)
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="light" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
        const account = page.locator('[data-shell-account]')
        await account.hover()
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-shell-account]')!).backgroundColor === 'rgba(9, 9, 11, 0.11)')
        const color = await page.locator('[data-shell-account-email]').evaluate((node) => getComputedStyle(node).color)
        expect(contrastOnSurface(color, [neutralColors.light.bgElev, neutralColors.light.bgHover])).toBeGreaterThanOrEqual(4.5)
      } finally { await page.close(); unmount() }
    })

    it('keeps an outside-month date numeral readable at ' + width, async () => {
      const { container, unmount } = render(<DateField value="2025-06-15" onChange={() => {}} />)
      fireEvent.click(container.querySelector('button')!)
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="light" style="${variables}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
        const day = page.locator('button[data-day="2025-07-01"]')
        await day.hover()
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-day="2025-07-01"]')!).backgroundColor === 'rgba(9, 9, 11, 0.11)')
        const color = await day.locator('span').evaluate((node) => getComputedStyle(node).color)
        expect(contrastOnSurface(color, [neutralColors.light.bgField, neutralColors.light.bgHover])).toBeGreaterThanOrEqual(4.5)
      } finally { await page.close(); unmount() }
    })

    it('keeps the partial day empty arc visible at ' + width, async () => {
      const { container, unmount } = render(<DayCell day={16} done={1} scheduled={2} words={{ none: 'Empty', partial: 'Partial', full: 'Done', notScheduled: 'Not scheduled', of: 'of', today: 'Today', readOnly: 'Read only' }} loggable onPress={() => {}} />)
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="light" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
        const resting = await page.locator('circle').first().evaluate((node) => getComputedStyle(node).stroke)
        await page.locator('button').hover()
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-press-fill]')!).opacity === '1')
        const stroke = await page.locator('circle').first().evaluate((node) => getComputedStyle(node).stroke)
        expect(stroke).toBe(resting)
        for (const surface of [neutralColors.light.bg, neutralColors.light.bgCard]) {
          expect(contrastOnSurface(stroke, [surface])).toBeGreaterThanOrEqual(3)
          expect(contrastOnSurface(stroke, [surface, neutralColors.light.bgHover])).toBeGreaterThanOrEqual(3)
        }
      } finally { await page.close(); unmount() }
    })

    it.each(cases)('keeps $name readable at ' + width, async ({ element, ...scenario }) => {
      const { container, unmount } = render(element)
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="light" style="${variables}"><style>${stylesheet}</style><body>${'selector' in scenario ? document.body.innerHTML : container.innerHTML}</body></html>`)
        const selector = scenario.selector ?? 'button'
        const control = page.locator(selector).first()
        const resting = await control.evaluate((button) => [...button.querySelectorAll<HTMLElement>('*'), button]
          .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
          .map((element) => getComputedStyle(element).color))
        await control.hover()
        await page.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)!).backgroundColor === 'rgba(9, 9, 11, 0.11)', selector)
        const colors = await control.evaluate((button) => [...button.querySelectorAll<HTMLElement>('*'), button]
          .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
          .map((element) => getComputedStyle(element).color))
        const rgb = (hex: string) => `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`
        const expected = resting.map((color) => color === rgb(neutralColors.light.fg3)
          ? rgb(neutralColors.light.fg2)
          : color === rgb(resolveWebThemeVariables('orange', 'light')['--primary-soft']!)
            ? rgb(resolveWebThemeVariables('orange', 'light')['--primary-text']!) : color)
        expect(colors).toEqual(expected)
        await page.mouse.down()
        const pressedColors = await control.evaluate((button) => [...button.querySelectorAll<HTMLElement>('*'), button]
          .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
          .map((element) => getComputedStyle(element).color))
        expect(pressedColors).toEqual(expected)
        await page.mouse.move(0, 0)
        const expectedPressOnly = resting.map((color) => color === rgb(neutralColors.light.fg3) ? rgb(neutralColors.light.fg2) : color)
        await page.waitForFunction(({ selector, colors }) => {
          const button = document.querySelector(selector)!
          const painted = [...button.querySelectorAll<HTMLElement>('*'), button]
            .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
            .map((element) => getComputedStyle(element).color)
          return !button.matches(':hover') && painted.length === colors.length && painted.every((color, index) => color === colors[index])
        }, { selector, colors: expectedPressOnly })
        const pressOnly = await control.evaluate((button) => [...button.querySelectorAll<HTMLElement>('*'), button]
          .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
          .map((element) => getComputedStyle(element).color))
        expect(pressOnly).toEqual(expectedPressOnly)
        const pressedBackground = await control.evaluate((button) => getComputedStyle(button).backgroundColor)
        for (const surface of [neutralColors.light.bg, neutralColors.light.bgElev]) {
          for (const color of pressOnly) {
            expect(contrastOnSurface(color, [surface, pressedBackground])).toBeGreaterThanOrEqual(4.5)
          }
        }
        await page.mouse.up()
        expect(colors.length).toBeGreaterThan(0)
        for (const surface of [neutralColors.light.bg, neutralColors.light.bgElev]) {
          for (const color of colors) {
            expect(contrastOnSurface(color, [surface, neutralColors.light.bgHover])).toBeGreaterThanOrEqual(4.5)
          }
        }
      } finally {
        await page.close()
        unmount()
      }
    })
  }
})
