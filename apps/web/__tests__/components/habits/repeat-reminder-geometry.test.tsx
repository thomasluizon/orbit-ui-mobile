import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { readControlHitArea } from '@/test-support/control-hit-area'

function bundleRepeatSurfaces() {
  const contents = `import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { NextIntlClientProvider, useTranslations } from 'next-intl';
    import en from '../../packages/shared/src/i18n/en.json';
    import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
    import { createMockHabit } from '../../packages/shared/src/__tests__/factories';
    import { HabitRow } from './components/habits/habit-row';
    import { RepeatReminderSection } from './components/habits/habit-form-fields/repeat-reminder-section';
    import { ReminderSection } from './components/habits/habit-form-fields/reminder-section';
    import { ScheduledReminderSection } from './components/habits/habit-form-fields/scheduled-reminder-section';
    import { Sheet, useSheetHost } from './components/ui/sheet';
    import { PillButton } from './components/ui/pill-button';
    import { TimeField } from './components/ui/time-field';
    import { formatHabitReminderLabel } from '../../packages/shared/src/utils';
    const root = document.getElementById('root');
    const locale = root.dataset.locale;
    function TimingSheet() {
      const t = useTranslations();
      const [offsets, setOffsets] = useState([0, 15]);
      const [clocks, setClocks] = useState([]);
      const { sheetRef, closeSheet } = useSheetHost();
      return <Sheet ref={sheetRef} open title={t('habits.form.timingAndReminder')} onClose={() => {}}
        actions={<PillButton onClick={() => closeSheet()}>{t('common.done')}</PillButton>}>
        <fieldset className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
          <div className="flex min-w-0 flex-col gap-4">
            <TimeField label={t('habits.form.exactTime')} value="08:00" onChange={() => {}} />
            <TimeField label={t('habits.form.dueEndTime')} value="" onChange={() => {}} />
          </div>
          <RepeatReminderSection value={null} enabled general={false} onChange={() => {}} onToggle={() => {}}>
            <ReminderSection reminderEnabled reminderTimes={offsets} onReminderTimesChange={setOffsets}
              reminderLabel={minutes => formatHabitReminderLabel(minutes, t)} scheduledReminderCount={clocks.length} t={t}>
              <ScheduledReminderSection reminderEnabled scheduledReminders={clocks} offsetReminderCount={offsets.length} onSetScheduledReminders={setClocks} t={t} />
            </ReminderSection>
          </RepeatReminderSection>
        </fieldset>
      </Sheet>;
    }
    function Surfaces() {
      const [repeat, setRepeat] = useState({ intervalMinutes: 480, activeStart: '20:00', activeEnd: '06:00', startAtUtc: '2026-10-29T00:00:00Z' });
      return <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section id="repeat-form"><RepeatReminderSection value={repeat} enabled general={false} timeZone="UTC" onChange={setRepeat} onToggle={() => {}} /></section>
        {[0, 1].map(depth => <HabitRow key={depth} habit={createMockHabit({ title: 'Water', repeatReminder: repeat, nextReminderAtUtc: '2026-10-29T04:00:00Z' })} depth={depth} actions={{ onEdit: () => {} }} />)}
      </main>;
    }
    createRoot(root).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">{root.dataset.timing ? <TimingSheet /> : <Surfaces />}</NextIntlClientProvider>);`
  const options = { stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], alias: { '@sentry/nextjs': '@sentry/react' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } }
  const script = `import { build } from 'esbuild';
    const options = ${JSON.stringify(options)};
    options.plugins = [{ name: 'repeat-boundaries', setup(build) {
      build.onResolve({ filter: /use-(profile|reminder-permission)$/ }, args => ({ path: args.path, namespace: 'repeat-boundary' }));
      build.onLoad({ filter: /.*/, namespace: 'repeat-boundary' }, args => ({ loader: 'js', contents: args.path.endsWith('use-profile')
        ? 'export const useProfile = () => ({ profile: { uses24HourClock: true, timeZone: "UTC" } }); export const useHasProAccess = () => true;'
        : 'export const useReminderPermission = (enabled, toggle) => ({ toggleReminder: toggle, showNotice: false });' }));
    }}];
    const result = await build(options); process.stdout.write(result.outputFiles[0].text);`
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}

describe('repeat reminder compact surfaces', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let bundle: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => { stylesheet = await compileHabitRowStylesheet(); bundle = bundleRepeatSurfaces() })
  afterAll(async () => { await closeChrome(launch) })

  it.each([412, 1280])('keeps the custom reminder Add target reachable in the timing sheet at %spx', async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:16px}body{margin:0;background:var(--bg)}</style><div id="root" data-locale="pt-BR" data-timing="true"></div>`)
      await loadAppFonts(page)
      await page.addScriptTag({ content: bundle })
      const timing = page.getByRole('dialog', { name: ptBR.habits.form.timingAndReminder, exact: true })
      await timing.getByRole('button', { name: ptBR.habits.form.reminderAdd, exact: true }).click()
      await timing.getByRole('button', { name: ptBR.habits.form.reminderCustom, exact: true }).click()
      await timing.getByRole('spinbutton', { name: ptBR.habits.form.reminderCustomLabel }).fill('45')
      const add = timing.getByRole('button', { name: ptBR.common.add, exact: true })
      await add.scrollIntoViewIfNeeded()
      await add.hover()
      const hit = await add.evaluate(readControlHitArea)
      const blocker = await add.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom + 1.99)?.outerHTML
      })
      expect(hit.checks, blocker).toEqual([true, true, true, true])
      expect(hit.width).toBeGreaterThanOrEqual(48)
      expect(hit.height).toBeGreaterThanOrEqual(48)
      await add.click()
      expect(await timing.getByText(ptBR.habits.form.reminderCustomLabel, { exact: true }).count()).toBe(0)
      expect(await timing.getByText(`45 ${ptBR.habits.form.reminderMinutes}`, { exact: true }).count()).toBe(1)
    } finally { await page.close() }
  })

  it.each(([320, 360, 384, 412]).flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => (['light', 'dark'] as const).map(mode => ({ width, locale, mode })))))(
    'fits complete labels with one focus indicator at $width in $locale/$mode', async ({ width, locale, mode }) => {
      const page = await browser.newPage({ viewport: { width, height: 2200 }, reducedMotion: 'reduce' })
      try {
        const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:16px}body{margin:0;padding:16px;background:var(--bg)}</style><div id="root" data-locale="${locale}"></div>`)
        await loadAppFonts(page)
        await page.addScriptTag({ content: bundle })
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 2)
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        const messages = locale === 'en' ? en : ptBR
        const interval = page.getByRole('combobox', { name: messages.habits.form.repeatEvery, exact: true })
        await page.keyboard.press('Tab')
        await interval.focus()
        await page.waitForFunction(() => [...document.querySelectorAll('[role="combobox"]')].some(element => element.matches(':focus-visible') && getComputedStyle(element).boxShadow.includes('2px')))
        const focus = await interval.evaluate((element) => ({ shadow: getComputedStyle(element).boxShadow, outline: getComputedStyle(element).outlineWidth, outlineColor: getComputedStyle(element).outlineColor, outlineStyle: getComputedStyle(element).outlineStyle }))
        expect(focus.shadow).toContain('2px')
        expect(focus.outlineStyle).toBe('none')
        expect([...focus.shadow.matchAll(/\b0px 0px 0px ([1-9]\d*)px/g)]).toHaveLength(1)
        const geometry = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('#repeat-form [role="combobox"]')].map(element => element.getBoundingClientRect())
          const choices = document.querySelector('#repeat-form [role="radiogroup"]')!.getBoundingClientRect()
          const next = [...document.querySelectorAll('[data-habit-row-meta-token]')].filter(element => /04:00/.test(element.textContent))
          return { scrollWidth: document.documentElement.scrollWidth, clearance: controls[0]!.top - choices.bottom, choiceCount: document.querySelectorAll('#repeat-form [role="radiogroup"] [role="radio"]').length, intervalCount: controls.length,
            next: next.map(element => { const range = document.createRange(); range.selectNodeContents(element.firstChild!); const rect = element.getBoundingClientRect(); return { lines: range.getClientRects().length, left: rect.left, right: rect.right, overflow: getComputedStyle(element).textOverflow } }),
            controlsFit: controls.every(rect => rect.left >= 16 && rect.right <= innerWidth - 16),
          }
        })
        expect(geometry.scrollWidth).toBeLessThanOrEqual(width)
        expect(geometry.controlsFit).toBe(true)
        expect(geometry.choiceCount).toBe(2)
        expect(geometry.intervalCount).toBe(1)
        expect(geometry.clearance).toBeGreaterThanOrEqual(12)
        expect(geometry.next).toHaveLength(2)
        for (const next of geometry.next) { expect(next.right).toBeLessThanOrEqual(width - 16); expect(next.left).toBeGreaterThanOrEqual(16); expect(next.overflow).not.toBe('ellipsis'); expect(next.lines).toBe(1) }
      } finally { await page.close() }
    },
  )
})
