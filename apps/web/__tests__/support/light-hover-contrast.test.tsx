import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, fireEvent } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { neutralColors } from '@orbit/shared/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { ShellWide } from '@/components/shell/shell-wide'
import { HabitLogButton } from '@/components/habits/habit-log-button'
import { DateField } from '@/components/ui/date-field'
import { DayCell } from '@/components/dates/day-cell'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))

const cases = [
  { name: 'checked row', element: <CheckRow label="Checked" checked description="Description" value="Value" onChange={() => {}} /> },
  { name: 'row error', element: <CheckRow label="Checked" checked error="Error" onChange={() => {}} /> },
  { name: 'personal row error', element: <CheckRow label="Personal" textMode="personal" onOpenLabel={() => {}} checked error="Error" value="Value" onChange={() => {}} /> },
  { name: 'list row', element: <ListRow title="Delete" danger description="Description" value="Value" onClick={() => {}} /> },
  { name: 'settings row', element: <SettingsRow label="Delete" danger desc="Description" value="Value" onClick={() => {}} /> },
  { name: 'settings group row', element: <SettingsGroupRow label="Preferences" hint="Value" onClick={() => {}} /> },
  { name: 'settings group value', element: <SettingsGroup items={[{ label: 'Preferences', value: 'Value', onClick: () => {} }]} /> },
  { name: 'inactive tab', element: <BottomTabBar label="Navigation" activeId="other" items={[{ id: 'today', label: 'Today' }]} onSelect={() => {}} /> },
  { name: 'active tab', element: <BottomTabBar label="Navigation" activeId="today" items={[{ id: 'today', label: 'Today' }]} onSelect={() => {}} /> },
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

    it.each(cases)('keeps $name readable at ' + width, async ({ element }) => {
      const { container, unmount } = render(element)
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<html class="light" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
        const control = page.locator('button').first()
        await control.hover()
        await page.waitForFunction(() => getComputedStyle(document.querySelector('button')!).backgroundColor === 'rgba(9, 9, 11, 0.11)')
        const colors = await control.evaluate((button) => [...button.querySelectorAll<HTMLElement>('*'), button]
          .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
          .map((element) => getComputedStyle(element).color))
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
