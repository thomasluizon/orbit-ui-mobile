import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { Locator, Page } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
import { readControlHitArea } from '@/test-support/control-hit-area'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 412, 600, 1024, 1352].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  (['rows', 'calendar', 'composer', 'composerPaste', 'tabs'] as const).flatMap((surface) =>
    (['hover', 'press', 'focus'] as const).filter((state) => surface !== 'tabs' || state === 'focus').map((state) => ({ width, locale, state, surface, mode: 'dark' as const, forcedColors: 'none' as const })))))
  .flatMap((scenario) => scenario.width === 320 && scenario.locale === 'en' && scenario.state === 'focus' ? [scenario, { ...scenario, mode: 'light' as const }, { ...scenario, forcedColors: 'active' as const }] : [scenario])

const composerValues = { composer: 'Message', composerPaste: '' }

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

async function assertComposerRow(page: Page, messages: typeof en | typeof ptBR, surface: 'composer' | 'composerPaste') {
  const row = page.locator('[data-composer-input-row]')
  const geometry = await row.evaluate(element => {
    const style = getComputedStyle(element)
    const trailing = element.querySelector('[data-composer-trailing-controls]')!
    const entry = element.querySelector('[data-open-conversation]')!
    const minimum = element.querySelector('[data-composer-input-minimum]')!
    const textControls = trailing.querySelector('[data-composer-text-controls]')!
    const bounds = element.getBoundingClientRect()
    const children = [...element.children].map(child => child.getBoundingClientRect())
    return {
      available: element.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
      required: entry.getBoundingClientRect().width + minimum.getBoundingClientRect().width
        + textControls.getBoundingClientRect().width + trailing.lastElementChild!.getBoundingClientRect().width
        + parseFloat(getComputedStyle(trailing).columnGap),
      top: bounds.top, height: bounds.height,
      borderTop: parseFloat(style.borderTopWidth), borderBottom: parseFloat(style.borderBottomWidth),
      lineTops: [...new Set(children.map(child => child.top))].sort((left, right) => left - right),
      heights: children.map(child => child.height),
    }
  })
  const control = page.getByRole('button', { name: messages.shell.composer[surface === 'composer' ? 'clear' : 'paste'], exact: true })
  const textActionInMenu = geometry.required > geometry.available
  await expect.poll(() => control.count()).toBe(textActionInMenu ? 0 : 1)
  if (!textActionInMenu) expect(await control.evaluate(element => element.parentElement!.firstElementChild === element)).toBe(true)
  const bounds = await page.locator('[data-composer-trailing-controls] button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
  expect(new Set(bounds).size).toBe(1)
  expect(geometry.lineTops.length).toBeGreaterThanOrEqual(1)
  expect(geometry.lineTops.length).toBeLessThanOrEqual(2)
  for (const height of geometry.heights) expect(height).toBe(48)
  for (const [index, top] of geometry.lineTops.entries()) {
    expect(top).toBeCloseTo(geometry.top + geometry.borderTop + 8 + index * 48, 1)
  }
  expect(geometry.height).toBeCloseTo(geometry.lineTops.length * 48 + 16 + geometry.borderTop + geometry.borderBottom, 1)
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
    composerPaste: <Composer state="idle" value="" suggestions={[]} words={messages.shell.composer}
        onChangeValue={vi.fn()} onSend={vi.fn()} onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation}
        onAttachFile={vi.fn()} attachWords={{ ...messages.shell.composer.attach, remove: (name: string) => name }} />,
    tabs: <BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
        items={(['today', 'calendar', 'progress', 'profile'] as const).map((id) => ({ id, label: messages.nav[id], href: '/', icon: ({ active }) => <DestinationIcon destination={id === 'today' ? 'hoje' : id === 'calendar' ? 'calendario' : id === 'progress' ? 'progresso' : 'perfil'} active={active} /> }))} />,
  }
}

describe('shared interaction fill owners in Chromium', () => {
  afterEach(() => vi.unstubAllGlobals())
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let composerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    composerScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const result = await build({
        stdin: { contents: JSON.parse(process.argv[1]), resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
        plugins: [{ name: 'composer-menu-boundary', setup(builder) {
          builder.onResolve({ filter: /^@\\/components\\/ui\\/(dropdown-menu|sheet)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
          builder.onResolve({ filter: /^@\\/stores\\/auth-store$/ }, args => ({ path: args.path, namespace: 'boundary' }));
          builder.onLoad({ filter: /.*/, namespace: 'boundary' }, () => ({ contents: 'export const useAuthStore = { getState: () => ({ isAuthenticated: true, user: { userId: "composer-account" } }) }; export const Root = ({ children }) => children; export const Trigger = ({ children }) => children; export const Content = () => null; export const Sheet = () => null;', loader: 'js' }));
        } }],
      });
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify(`import React from 'react'; import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import { Composer } from './components/shell/composer';
      const { messages, value, locale } = JSON.parse(document.getElementById('composer-configuration').textContent);
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '' } });
      createRoot(document.getElementById('composer-mount')).render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><Composer state="idle" value={value} suggestions={[]}
        words={messages.shell.composer} onChangeValue={() => {}} onSend={() => {}}
        onOpenConversation={() => {}} conversationLabel={messages.todayAstra.openConversation}
        onAttachFile={() => {}} attachWords={{ ...messages.shell.composer.attach, remove: name => name }} /></NextIntlClientProvider>);`)],
      { maxBuffer: 10 * 1024 * 1024 }).toString()
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('clears the $surface fills at $width in $locale while $state in $mode with forced colors $forcedColors', async ({ width, locale, state, surface, mode, forcedColors }) => {
    const messages = locale === 'en' ? en : ptBR
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('') } })
    const content = (<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <main data-shell-column="" data-focus-inset={surface === 'rows' ? 'panel' : undefined} style={{ maxWidth: 740, margin: 'auto' }}>{ownerSurfaces(messages)[surface]}</main>
    </NextIntlClientProvider>)
    const composerSurface = surface === 'composer' || surface === 'composerPaste'
    const markup = composerSurface
      ? `<main data-shell-column style="max-width:740px;margin:auto"><div id="composer-mount"></div></main><script id="composer-configuration" type="application/json">${JSON.stringify({ messages, value: composerValues[surface], locale })}</script>`
      : renderToStaticMarkup(content)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce', forcedColors })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet} *, *::before, *::after { transition: none !important }</style>${markup}</html>`)
      if (composerSurface) {
        await page.addScriptTag({ content: composerScript })
        await page.locator('[data-composer-input]').waitFor()
      }
      await loadAppFonts(page)
      if (composerSurface) await assertComposerRow(page, messages, surface)
      const controls = page.locator('button:not(:disabled):not([aria-disabled="true"]), a[href], [role="switch"]')
      for (const control of await controls.all()) {
        await control.scrollIntoViewIfNeeded()
        const target = (await control.boundingBox())!
        const hit = await control.evaluate(readControlHitArea)
        expect(hit.width).toBeGreaterThanOrEqual(48)
        expect(hit.height).toBeGreaterThanOrEqual(48)
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
