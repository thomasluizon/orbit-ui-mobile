import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { neutralColors } from '@orbit/shared/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsGroupRow } from '@/components/ui/settings-group'
import { SettingsGroup } from '@/components/ui/settings-group-list'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

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
