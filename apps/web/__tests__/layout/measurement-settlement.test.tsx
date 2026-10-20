import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { execFileSync } from 'node:child_process'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import { calendarDayCardDate, makeCalendarDayCardEntries } from '@orbit/shared/test-support/calendar-day-card-fixtures'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { expectCalendarDayHabitRows } from '@/e2e/layout/calendar-day-habit-geometry'
import { expectCalendarDayLinkFocus } from '@/e2e/layout/calendar-day-link-focus'
import { authoredLabelSelector, expectLabelsFit } from '@/e2e/layout/label-fit-contract'
import { assertHabitRows, setHabitTextScale } from '@/e2e/layout/subhabit-indent-geometry'
import { HabitTextScaleFixture, supportingHabitTitles } from '../support/habit-text-scale-fixture'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '../support/chromium'

vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let stylesheet: string
let habitScript: string
let mutedHabitScript: string
let habitErrors: string[] = []
const entries = makeCalendarDayCardEntries()

registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    + `:root{${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')}}`
  const buildOptions = {
    stdin: { contents: `import React from 'react'; import { hydrateRoot } from 'react-dom/client';
      import { HabitTextScaleFixture } from './__tests__/support/habit-text-scale-fixture';
      hydrateRoot(document.getElementById('habit-root'), React.createElement(HabitTextScaleFixture));`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', __dirname: '"/"' },
  }
  const scripts = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    import { readFileSync } from 'node:fs';
    const processPolyfill = await build({ entryPoints: ['next/dist/compiled/process'],
      bundle: true, write: false, format: 'iife', globalName: 'process', platform: 'browser',
      define: { __dirname: '"/"' } });
    const options = JSON.parse(process.argv[1]);
    const result = await build(options);
    const muted = await build({ ...options, plugins: [{ name: 'lost-habit-notifications', setup(builder) {
      builder.onLoad({ filter: /use-habit-row-large-text\\.ts$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8');
        const contents = source.replace('new MutationObserver(onChange)', 'new MutationObserver(() => {})')
          .replace("window.addEventListener('resize', onChange)", "window.addEventListener('resize', () => {})");
        if (contents === source || contents.includes('MutationObserver(onChange)')
          || contents.includes("addEventListener('resize', onChange)")) throw new Error('Notification mutation did not apply');
        return { contents, loader: 'ts' };
      });
    } }] });
    process.stdout.write(JSON.stringify({ normal: processPolyfill.outputFiles[0].text + result.outputFiles[0].text,
      muted: processPolyfill.outputFiles[0].text + muted.outputFiles[0].text }));
  `, JSON.stringify(buildOptions)], { maxBuffer: 10 * 1024 * 1024 }).toString()) as { normal: string; muted: string }
  habitScript = scripts.normal
  mutedHabitScript = scripts.muted
})
afterAll(async () => { await closeChrome(browserLaunch) })
afterEach(() => {
  const errors = habitErrors
  habitErrors = []
  expect(errors).toEqual([])
})

function dayMarkup() {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <CalendarDayDetail dateStr={calendarDayCardDate} today={calendarDayCardDate} entries={entries}
      calendarEvents={[]} calendarEventsState="ready" loggable={false} showRecurring
      pendingEntryStates={new Map()} onEntryChange={() => null} onRetryCalendarEvents={() => {}}
      onReconnectCalendarEvents={() => {}} onOpenCalendarImport={() => {}} onViewPro={() => {}} />
  </NextIntlClientProvider>)
}

it('resamples every row after the root scale is replaced between setup and measurement', async () => {
  const page = await browser.newPage({ viewport: { width: 1352, height: 915 } })
  try {
    await page.setContent(`<style>${stylesheet}</style><main style="padding:24px;width:740px">${dayMarkup()}</main>`)
    const card = page.locator('section')
    const evaluate = card.evaluate.bind(card)
    const interleaving = vi.spyOn(card, 'evaluate').mockImplementationOnce(async (callback, argument) => {
      await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
      return evaluate(callback, argument)
    })
    const heights = await expectCalendarDayHabitRows(card, entries, en.calendar.timeGrid.noSetTime, 2)
    expect(heights).toHaveLength(entries.length)
    expect(interleaving.mock.calls.length).toBeGreaterThan(1)
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).fontSize)).toBe('32px')
  } finally { vi.restoreAllMocks(); await page.close() }
})

it('replays the whole keyboard traversal after its focused day link is replaced', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${stylesheet}</style><main style="padding:24px;width:600px">${dayMarkup()}</main>`)
    await page.evaluate(() => {
      const replaceFocusedLink = (event: KeyboardEvent) => {
        const link = document.activeElement
        if (event.key !== 'Tab' || event.shiftKey || !(link instanceof HTMLAnchorElement)) return
        const replacement = link.cloneNode(true) as HTMLAnchorElement
        replacement.dataset.replaced = 'true'
        link.replaceWith(replacement)
        document.removeEventListener('keyup', replaceFocusedLink)
      }
      document.addEventListener('keyup', replaceFocusedLink)
    })
    const link = page.getByRole('link', { name: en.calendar.goToDay, exact: true })
    await expectCalendarDayLinkFocus(link)
    expect(await link.getAttribute('data-replaced')).toBe('true')
    expect(await link.evaluate((element) => document.activeElement === element)).toBe(true)
  } finally { await page.close() }
}, 30_000)

it('waits for rendered authored labels in the requested surface', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<h1>Unrelated shell label</h1><main></main>')
    const surface = page.getByRole('main')
    const labels = surface.locator(`${authoredLabelSelector}, [data-layout-text-origin="user"]`)
    const evaluateAll = labels.evaluateAll.bind(labels)
    vi.spyOn(surface, 'locator').mockReturnValueOnce(labels)
    vi.spyOn(labels, 'evaluateAll').mockImplementationOnce(async (callback, argument) => {
      const sample = await evaluateAll(callback, argument)
      await page.evaluate(() => { document.querySelector('main')!.innerHTML = '<button>Alerts on this device</button>' })
      return sample
    })
    await expectLabelsFit(page, surface)
    expect(await page.getByRole('main').textContent()).toBe('Alerts on this device')
  } finally { vi.restoreAllMocks(); await page.close() }
})

async function habitPage(script?: string) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
  page.on('pageerror', (error) => { habitErrors.push(error.stack ?? error.message) })
  await page.setContent(`<!doctype html><style>${stylesheet}html{font-size:16px}body{margin:0;padding:16px}</style><main id="habit-root">${renderToString(<HabitTextScaleFixture />)}</main>`)
  await page.evaluate(() => {
    const host = document.getElementById('habit-root')!
    host.dataset.scaleNotifications = '0'
    host.dataset.scaleWrites = '0'
    window.addEventListener('resize', (event) => {
      if (!event.isTrusted) host.dataset.scaleNotifications = String(Number(host.dataset.scaleNotifications) + 1)
    })
    new MutationObserver((records) => {
      host.dataset.scaleWrites = String(Number(host.dataset.scaleWrites) + records.length)
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
  })
  if (script) await page.addScriptTag({ content: script })
  return page
}

it('waits for both real supporting phases while habit hydration is withheld', async () => {
  const page = await habitPage()
  let settled = false
  const scaling = setHabitTextScale(page, 2, supportingHabitTitles).then(() => { settled = true })
  try {
    await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '32px')
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    expect(settled, 'scale setup must wait for real supporting DOM').toBe(false)
    await page.addScriptTag({ content: habitScript })
    await scaling
    expect(await page.locator('[data-habit-row-heading]').count()).toBe(2)
    await assertHabitRows(page.getByTestId('habit-row'), 412, [0, 1], 2)
  } finally { await page.close(); await scaling.catch(() => {}) }
})

it('rejects a correct root font with persistently stale supporting phases', async () => {
  const page = await habitPage()
  try {
    await expect(setHabitTextScale(page, 2, supportingHabitTitles)).rejects.toThrow(/Habit text scale/)
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).fontSize)).toBe('32px')
    expect(await page.locator('[data-habit-row-heading]').count()).toBe(0)
    expect(await page.locator('#habit-root').getAttribute('data-scale-notifications')).toBe('1')
    expect(await page.locator('#habit-root').getAttribute('data-scale-writes')).toBe('1')
  } finally { await page.close() }
})

it('rejects habit geometry when the requested root font is lost before measurement', async () => {
  const page = await habitPage(habitScript)
  try {
    await setHabitTextScale(page, 2, supportingHabitTitles)
    const rows = page.getByTestId('habit-row')
    const locators = await rows.all()
    const evaluate = locators[0]!.evaluate.bind(locators[0]!)
    vi.spyOn(rows, 'all').mockResolvedValue(locators)
    vi.spyOn(locators[0]!, 'evaluate').mockImplementationOnce(async (callback, argument) => {
      await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
      return evaluate(callback, argument)
    })
    await expect(assertHabitRows(rows, 412, [0, 1], 2)).rejects.toThrow(/Habit geometry root font/)
  } finally { vi.restoreAllMocks(); await page.close() }
})

it('rejects a compiled hook with lost notifications while keeping the actual enlarged root', async () => {
  const page = await habitPage(mutedHabitScript)
  try {
    await page.getByRole('button', { name: 'Select rows', exact: true }).click()
    expect(await page.locator('[data-habit-row-control="selection"]').count()).toBe(2)
    await expect(setHabitTextScale(page, 2, supportingHabitTitles)).rejects.toThrow(/"computedFont":"32px"/)
    expect(await page.locator('[data-habit-row-heading]').count()).toBe(0)
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).fontSize)).toBe('32px')
    expect(await page.locator('#habit-root').getAttribute('data-scale-notifications')).toBe('1')
    expect(await page.locator('#habit-root').getAttribute('data-scale-writes')).toBe('1')
  } finally { await page.close() }
})
