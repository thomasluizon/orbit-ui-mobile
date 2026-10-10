import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ProfilePreferencesContent } from '@/app/(app)/profile/_components/profile-preferences-content'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { bundleProfilePreferences } from '@/__tests__/support/profile-settings-browser'

const preferences = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR', checked: false, open: vi.fn(), toggle: vi.fn() }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: preferences.locale, messages: preferences.locale === 'en' ? en : ptBR }) }
})
vi.mock('@/app/(app)/preferences/_components/use-preference-controls', () => ({ usePreferenceControls: () => ({
    selectedLanguage: preferences.locale, currentTheme: 'dark', currentScheme: 'purple',
    activePicker: null, setActivePicker: preferences.open, handleThemeModeChange: vi.fn(),
    showGeneralOnToday: preferences.checked, toggleShowGeneral: preferences.toggle,
    handleShowGeneralToggle: preferences.toggle, handleLanguageChange: vi.fn(),
    timeZoneMutation: { mutate: vi.fn() }, weekStartMutation: { mutate: vi.fn() }, clockFormatMutation: { mutate: vi.fn() },
  }) }))
vi.mock('@/app/(app)/preferences/_components/preference-picker-sheet', () => ({ PreferencePickerSheet: () => null }))

function renderPreferences() {
  return render(<div style={{ padding: 16 }}><ProfilePreferencesContent profile={createMockProfile({ timeZone: 'America/Sao_Paulo', weekStartDay: 1, uses24HourClock: true })} patchProfile={vi.fn()} /></div>)
}

describe('Profile preferences label geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let componentScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    componentScript = bundleProfilePreferences()
  }, 30_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => [1, 2].map((scale) => ({ locale, width, scale })))))('keeps every label whole in $locale at $width and scale $scale', async ({ locale, width, scale }) => {
    preferences.locale = locale as 'en' | 'pt-BR'
    const page = await browser.newPage({ viewport: { width, height: 2000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" style="padding:16px"></div>`)
      await page.locator('#root').evaluate((root, { locale, profile }) => {
        root.dataset.locale = locale
        root.dataset.profile = JSON.stringify(profile)
      }, { locale, profile: createMockProfile({ timeZone: 'America/Sao_Paulo', weekStartDay: 1, uses24HourClock: true }) })
      await page.addScriptTag({ content: componentScript })
      await page.getByRole('group').waitFor()
      await loadAppFonts(page)
      await page.evaluate((scale) => {
        if (scale === 2) {
          const sizes = [...document.querySelectorAll<HTMLElement>('body *')].map((element) => ({ element, size: parseFloat(getComputedStyle(element).fontSize), height: parseFloat(getComputedStyle(element).lineHeight) }))
          for (const { element, size, height } of sizes) { element.style.fontSize = `${size * scale}px`; if (Number.isFinite(height)) element.style.lineHeight = `${height * scale}px` }
        }
      }, scale)
      await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="list-row-title"]')).every((title) => {
        const wrapped = title.getBoundingClientRect().height > parseFloat(getComputedStyle(title).lineHeight) + 0.5
        return wrapped === title.hasAttribute('data-row-multiline')
      }))
      const measured = await page.evaluate(() => {
        const labels = [...document.querySelectorAll<HTMLElement>('[data-slot="list-row-title"], [data-slot="list-row-value"], [data-testid="profile-value-row"] > span:first-child, button:not([role="switch"]):not(.orbit-list-row-body), p')].filter((element) => element.tagName !== 'P' || !element.classList.contains('text-sm'))
        return labels.map((element) => {
          const range = document.createRange(); range.selectNodeContents(element)
          const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
          const bounds = element.getBoundingClientRect()
          return { label: element.textContent, lines: new Set(fragments.map((rect) => Math.round(rect.top))).size, clipped: fragments.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1), outside: bounds.left < 0 || bounds.right > window.innerWidth, ellipsis: getComputedStyle(element).textOverflow === 'ellipsis' || Number.parseInt(getComputedStyle(element).webkitLineClamp) > 0 }
        })
      })
      expect(measured).toHaveLength(12)
      for (const label of measured) {
        expect.soft(label, JSON.stringify(label)).toMatchObject({ clipped: false, outside: false, ellipsis: false })
        if (scale === 1) expect.soft(label.lines, label.label!).toBe(1)
      }
    } finally { await page.close() }
  })

  it('keeps picker actions and the switch name connected to their labels', () => {
    preferences.locale = 'pt-BR'
    renderPreferences()
    const t = createTranslator({ locale: 'pt-BR', messages: ptBR })
    for (const [key, picker] of [['profile.settingsRows.timezone', 'timeZone'], ['profile.settingsRows.weekStart', 'weekStart'], ['settings.clock.title', 'clock'], ['profile.language.title', 'language']] as const) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t(key)) }))
      expect(preferences.open).toHaveBeenLastCalledWith(picker)
    }
    fireEvent.click(screen.getByRole('switch', { name: t('settings.homeScreen.showGeneral') }))
    expect(preferences.toggle).toHaveBeenCalled()
  })
})
