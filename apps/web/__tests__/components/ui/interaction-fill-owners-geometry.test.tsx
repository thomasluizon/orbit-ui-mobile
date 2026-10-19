import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { Locator, Page } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ListRow } from '@/components/ui/list-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { Composer } from '@/components/shell/composer'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 412, 600, 1024, 1352].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  (['rows', 'calendar', 'composer', 'tabs'] as const).flatMap((surface) =>
    (['hover', 'press', 'focus'] as const).filter((state) => surface !== 'tabs' || state === 'focus').map((state) => ({ width, locale, state, surface, mode: 'dark' as const, forcedColors: 'none' as const })))))
  .flatMap((scenario) => scenario.width === 320 && scenario.locale === 'en' && scenario.state === 'focus' ? [scenario, { ...scenario, mode: 'light' as const }, { ...scenario, forcedColors: 'active' as const }] : [scenario])

function focusIndicators(element: Element) {
  return [element, ...element.querySelectorAll('*')].flatMap((owner) =>
    [null, '::before', '::after'].filter((pseudo) => {
      const style = getComputedStyle(owner, pseudo)
      return (!pseudo || !['none', 'normal'].includes(style.content)) && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    }))
}

async function reachState(page: Page, control: Locator, state: 'hover' | 'press' | 'focus') {
  if (state === 'focus') {
    await page.keyboard.press('Tab')
    await control.focus()
  } else {
    await control.hover()
    if (state === 'press') await page.mouse.down()
  }
}

function ownerSurfaces(messages: typeof en | typeof ptBR) {
  return {
    rows: <div style={{ padding: 16 }}><SettingsGroup>
        <ListRow title="Button row" onClick={vi.fn()} />
        <ListRow title="Link row" href="/profile" />
        <ListRow title="Switch row" toggle={{ checked: false, onChange: vi.fn() }} />
        <ListRow title="Action row" onClick={vi.fn()} action={{ icon: 'trash', label: 'Remove row', onPress: vi.fn() }} />
        <ListRow title="Static row" readOnly />
      </SettingsGroup></div>,
    calendar: <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-12"
        previousMonthLabel={messages.common.previousMonth} nextMonthLabel={messages.common.nextMonth}
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />,
    composer: <Composer state="idle" value="Message" suggestions={[]} words={messages.shell.composer}
        onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
        attachWords={{ ...messages.shell.composer.attach, remove: (name: string) => name }} />,
    tabs: <BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
        items={(['today', 'calendar', 'progress', 'profile'] as const).map((id) => ({ id, label: messages.nav[id], href: '/', icon: ({ active }) => <DestinationIcon destination={id === 'today' ? 'hoje' : id === 'calendar' ? 'calendario' : id === 'progress' ? 'progresso' : 'perfil'} active={active} /> }))} />,
  }
}

describe('shared interaction fill owners in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('clears the $surface fills at $width in $locale while $state in $mode with forced colors $forcedColors', async ({ width, locale, state, surface, mode, forcedColors }) => {
    const messages = locale === 'en' ? en : ptBR
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <main data-shell-column="" data-focus-inset={surface === 'rows' ? 'panel' : undefined} style={{ maxWidth: 740, margin: 'auto' }}>{ownerSurfaces(messages)[surface]}</main>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce', forcedColors })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet} *, *::before, *::after { transition: none !important }</style>${markup}</html>`)
      await loadAppFonts(page)
      if (surface === 'composer') {
        const clear = page.getByRole('button', { name: messages.shell.composer.clear, exact: true })
        expect(await clear.count()).toBe(1)
        expect(await clear.evaluate(element => element.parentElement!.firstElementChild === element)).toBe(true)
        const bounds = await page.locator('[data-composer-trailing-controls] button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
        expect(new Set(bounds).size).toBe(1)
      }
      const controls = page.locator('button:not(:disabled):not([aria-disabled="true"]), a[href], [role="switch"]')
      for (const control of await controls.all()) {
        await control.scrollIntoViewIfNeeded()
        const target = (await control.boundingBox())!
        expect(target.width).toBeGreaterThanOrEqual(48)
        expect(target.height).toBeGreaterThanOrEqual(48)
        await reachState(page, control, state)
        await control.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
        const result = await control.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
        expect(result.violations, result.control).toEqual([])
        if (surface === 'rows' && await control.evaluate((element) => element.classList.contains('orbit-list-row-body'))) {
          expect(result.hasFill, result.control).toBe(true)
          for (const gap of [result.fill.left - target.x, target.x + target.width - result.fill.right, result.fill.top - target.y, target.y + target.height - result.fill.bottom]) expect(gap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
        }
        if (state === 'focus') {
          expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
          const indicators = await control.evaluate(focusIndicators)
          expect(indicators, result.control).toHaveLength(1)
        }
        await page.mouse.move(0, 0)
        await page.mouse.up()
        await control.blur()
      }
    } finally { await page.close() }
  })
})
