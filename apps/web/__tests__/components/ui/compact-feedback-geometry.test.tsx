import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'
import { WrappedCover } from '@/app/(app)/wrapped/_components/wrapped-cover'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { ShellWide } from '@/components/shell/shell-wide'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { mountMeasuredSegmentedControls } from '@/__tests__/support/segmented-control-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { expectFillShape } from '@/e2e/layout/label-interaction-fill'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('compact feedback in its owning composition', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let calendarScript: string
  registerChromeLaunchHook(beforeAll, async pending => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    calendarScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      import { readFileSync } from 'node:fs';
      const result = await build({
        stdin: { contents: readFileSync(0, 'utf8'), resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        alias: { '@sentry/nextjs': '@sentry/browser' },
        define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      });
      process.stdout.write(result.outputFiles[0].text);
    `], { input: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import { CalendarHeader } from './app/(app)/calendar/_components/calendar-shell';
      const { locale, messages } = JSON.parse(document.getElementById('calendar-configuration').textContent);
      createRoot(document.getElementById('calendar-mount')).render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-12" previousMonthLabel={messages.common.previousMonth} nextMonthLabel={messages.common.nextMonth}
          onPreviousMonth={() => {}} onNextMonth={() => {}} onCurrentMonth={() => {}} onSelectMonth={() => {}} />
      </NextIntlClientProvider>);`, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 480, 840, 1100, 1440].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['onboarding', 'wrapped'] as const).map(surface => ({ width, locale, surface })),
  )))('keeps $surface paint clear at $width in $locale', async ({ width, locale, surface }) => {
    const messages = locale === 'en' ? en : ptBR
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <main style={{ padding: 16, maxWidth: 740, margin: 'auto' }}>
        {surface === 'onboarding' ? <OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} />
          : <WrappedCover period="week" state="ready" onSelectPeriod={vi.fn()} onStart={vi.fn()} onRetry={vi.fn()} />}
      </main>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" lang="${locale}" style="${variables}"><style>${stylesheet}</style><body>${markup}</body></html>`)
      await loadAppFonts(page)
      const controls = page.locator('button:visible:not(:disabled)')
      expect(await controls.count()).toBeGreaterThan(0)
      for (const control of await controls.all()) {
        for (const state of ['hover', 'press', 'focus']) {
          await control.hover()
          if (state === 'press') await page.mouse.down()
          if (state === 'focus') { await page.keyboard.press('Tab'); await control.focus() }
          await control.evaluate(async element => { for (const animation of element.getAnimations({ subtree: true })) if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish() })
          const result = await control.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
          expect(result.violations, `${result.control}, ${state}`).toEqual([])
          await page.mouse.up()
          await control.blur()
        }
      }
    } finally { await page.close() }
  })

  it.each(['en', 'pt-BR'] as const)('reaches every calendar view at 320 in %s', async locale => {
    const messages = locale === 'en' ? en : ptBR
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ShellWide items={[]} activeId="calendar" navLabel="Navigation" paletteLabel="Search" paletteHint="Ctrl K" onPalette={vi.fn()} onCreate={vi.fn()} createLabel="Create" astraRow={{ label: 'Astra', onOpen: vi.fn() }}>
        <div data-calendar-page="">
          <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-12" previousMonthLabel={messages.common.previousMonth} nextMonthLabel={messages.common.nextMonth}
            onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
            viewSelector={<SegmentedControl fullWidth label={messages.calendar.view.switchLabel} value="month" onChange={vi.fn()}
              options={[
                { value: 'month', label: messages.calendar.view.month },
                { value: 'week', label: messages.calendar.view.week },
                { value: 'range', label: messages.calendar.view.range },
                { value: 'agenda', label: messages.calendar.view.agenda },
              ]} />} />
          <div style={{ height: 500 }} />
        </div>
      </ShellWide>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" lang="${locale}" style="${variables}"><style>${stylesheet}</style><body>${markup}</body></html>`)
      await loadAppFonts(page)
      await mountMeasuredSegmentedControls(page)
      for (const view of ['month', 'week', 'range', 'agenda'] as const) {
        const control = page.getByRole('radio', { name: messages.calendar.view[view], exact: true })
        expect(await control.count()).toBe(1)
        const obstruction = await control.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          const reached = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
          return element.contains(reached) ? null : reached?.outerHTML
        })
        expect(obstruction, view).toBeNull()
        await control.click({ timeout: 1000 })
        expect(await control.getAttribute('aria-checked')).toBe('true')
      }
    } finally { await page.close() }
  })

  it.each(['en', 'pt-BR'] as const)('pads navigation feedback in %s', async locale => {
    const messages = locale === 'en' ? en : ptBR
    const page = await browser.newPage({ viewport: { width: 320, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet}</style><body><div id="calendar-mount"></div><script id="calendar-configuration" type="application/json">${JSON.stringify({ locale, messages })}</script></body></html>`)
      await page.addScriptTag({ content: calendarScript })
      await page.getByTestId('calendar-header-group').waitFor()
      await page.bringToFront()
      for (const name of [messages.common.previousMonth, messages.common.nextMonth]) {
        const control = page.getByRole('button', { name, exact: true })
        await control.hover()
        await expectFillShape(control, 'hover')
        await page.mouse.down()
        try { await expectFillShape(control, 'press') }
        finally { await page.mouse.up() }
        await page.keyboard.press('Tab')
        await control.focus()
        expect(await control.evaluate(element => element.matches(':focus-visible'))).toBe(true)
        await expectFillShape(control, 'focus')
      }
    } finally { await page.close() }
  })
})
