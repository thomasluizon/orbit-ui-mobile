import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { registerChromeLaunchHook } from '@/__tests__/support/chromium'
import { calendarGeometryHarness } from '@/__tests__/support/calendar-header-geometry'
import { readCalendarPeriodGeometry } from '@/e2e/layout/calendar-period-geometry'

interface HeaderFrame {
  label: { left: number; right: number; center: number }
  chevrons: { left: number; right: number; center: number }[]
}

function expectSeparateChevrons(frame: HeaderFrame) {
  expect(frame.chevrons).toHaveLength(2)
  for (const box of frame.chevrons) {
    expect(Math.abs(frame.label.center - box.center), JSON.stringify(frame)).toBeLessThanOrEqual(2)
    expect(box.left < frame.label.left || box.left > frame.label.right, JSON.stringify(frame)).toBe(true)
    expect(box.right <= frame.label.left || box.left >= frame.label.right, JSON.stringify(frame)).toBe(true)
  }
}

describe('Range header rendered frames', () => {
  const harness = calendarGeometryHarness(registerChromeLaunchHook)
  let script: string
  beforeAll(() => {
    script = execFileSync(resolve('../../node_modules/.bin/esbuild'), [
      '--bundle', '--loader=tsx', '--jsx=automatic', '--format=iife', '--platform=browser',
      '--define:process.env.NODE_ENV="production"', '--define:process.env={}',
      '--alias:@sentry/nextjs=@sentry/browser', '--alias:next/dynamic=next/dist/shared/lib/app-dynamic',
    ], { input: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider, useTranslations } from 'next-intl';
      import { CalendarHeader } from './app/(app)/calendar/_components/calendar-shell';
      import { SegmentedControl } from './components/ui/segmented-control';
      import { buildCalendarRangeModel, formatCalendarSpanEnds } from '@orbit/shared/utils';
      import { buildCalendarHeaderState } from '@orbit/shared/utils/calendar-navigation';
      import { readCalendarPeriodGeometry } from './e2e/layout/calendar-period-geometry';
      const configuration = JSON.parse(document.getElementById('configuration').textContent);
      const frames = [];
      window.rangeHeaderFrames = frames;
      async function sample() {
        const row = document.querySelector('[data-testid="calendar-range-navigation"]');
        if (row) frames.push(await readCalendarPeriodGeometry(row, false));
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      function Header() {
        const t = useTranslations();
        const [view, setView] = useState('month');
        const [rangeOffset, setRangeOffset] = useState(0);
        const today = new Date(2026, 8, 12);
        const end = new Date(2026, 8, 12 + rangeOffset * 14);
        const model = buildCalendarRangeModel(end, new Map(), 1, '2026-09-12');
        const rangeLabel = t('calendar.range.label', formatCalendarSpanEnds(model.start, model.end, configuration.locale));
        const noop = () => {};
        const navigation = buildCalendarHeaderState({ view, selectedDay: '2026-09-12', todayKey: '2026-09-12',
          weekStart: today, weekStartsOn: 1, rangeOffset, agendaOffset: 0, weekLabel: '', rangeLabel,
          agendaStart: today, agendaEnd: today, locale: configuration.locale, translate: t,
          prevWeek: noop, nextWeek: noop, goToCurrentWeek: noop, setRangeOffset, setAgendaOffset: noop,
          previousRange: () => setRangeOffset(offset => offset - 1), nextRange: () => setRangeOffset(offset => offset + 1) });
        return <CalendarHeader currentMonth={today} todayKey="2026-09-12" {...navigation}
          previousMonthLabel={t('common.previousMonth')} nextMonthLabel={t('common.nextMonth')}
          onPreviousMonth={noop} onNextMonth={noop} onCurrentMonth={noop} onSelectMonth={noop}
          viewSelector={<SegmentedControl fullWidth value={view} onChange={setView} label={t('calendar.view.switchLabel')}
            options={['month', 'week', 'range', 'agenda'].map(value => ({ value, label: t('calendar.view.' + value) }))} />} />;
      }
      createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={configuration.locale}
        messages={configuration.messages} timeZone="UTC"><Header /></NextIntlClientProvider>);
    `, maxBuffer: 10 * 1024 * 1024 }).toString()
  })

  it.each([320, 360, 384, 412, 600, 840].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
    'keeps chevrons outside the label through switching, font loading and paging at $width in $locale', async ({ width, locale }) => {
      const messages = locale === 'en' ? en : ptBR
      const page = await harness.browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${harness.stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ locale, messages })}</script>`)
        await page.addScriptTag({ content: script })
        await page.getByRole('radio', { name: messages.calendar.view.month, exact: true }).waitFor()
        await page.getByRole('radio', { name: messages.calendar.view.range, exact: true }).click()
        const row = page.getByTestId('calendar-range-navigation')
        expectSeparateChevrons(await row.evaluate(readCalendarPeriodGeometry))
        await loadAppFonts(page)
        const label = page.locator('[data-calendar-period-title]')
        const initial = await label.innerText()
        await page.getByRole('button', { name: messages.calendar.range.previous, exact: true }).click()
        expect(await label.innerText()).not.toBe(initial)
        expectSeparateChevrons(await row.evaluate(readCalendarPeriodGeometry))
        await page.getByRole('button', { name: messages.calendar.range.next, exact: true }).click()
        expect(await label.innerText()).toBe(initial)
        expectSeparateChevrons(await row.evaluate(readCalendarPeriodGeometry))
        const snapshots = await page.evaluate(() => Reflect.get(window, 'rangeHeaderFrames') as HeaderFrame[])
        expect(snapshots.length).toBeGreaterThan(0)
        for (const snapshot of snapshots) expectSeparateChevrons(snapshot)
      } finally { await page.close() }
    },
  )

  it('rejects a chevron moved inside the settled label box', async () => {
    const page = await harness.browser.newPage({ viewport: { width: 840, height: 915 } })
    try {
      await page.setContent(`<style>${harness.stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ locale: 'en', messages: en })}</script>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('radio', { name: en.calendar.view.range, exact: true }).click()
      const row = page.getByTestId('calendar-range-navigation')
      expectSeparateChevrons(await row.evaluate(readCalendarPeriodGeometry))
      await row.evaluate(element => {
        const label = element.querySelector('[data-calendar-period-title]')!.getBoundingClientRect()
        const chevron = element.querySelector('button')!
        const box = chevron.getBoundingClientRect()
        chevron.style.transform = `translateX(${label.left + 8 - box.left}px)`
      })
      const moved = await row.evaluate(readCalendarPeriodGeometry)
      expect(() => expectSeparateChevrons(moved)).toThrow('expected false to be true')
    } finally { await page.close() }
  })

  it('waits for shared header motion and measures every box in the same frame', async () => {
    const page = await harness.browser.newPage({ viewport: { width: 840, height: 915 } })
    try {
      await page.setContent(`<style>${harness.stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ locale: 'en', messages: en })}</script>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('radio', { name: en.calendar.view.range, exact: true }).click()
      const row = page.getByTestId('calendar-range-navigation')
      const before = await row.evaluate(readCalendarPeriodGeometry)
      await row.evaluate(async element => {
        const animation = element.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }], { duration: 150, fill: 'forwards' })
        await animation.ready
      })
      const after = await row.evaluate(readCalendarPeriodGeometry)
      expect(after.label.left - before.label.left).toBeCloseTo(100, 1)
      expectSeparateChevrons(after)
      for (const [index, chevron] of after.chevrons.entries()) {
        expect(chevron.left - before.chevrons[index]!.left).toBeCloseTo(100, 1)
      }
    } finally { await page.close() }
  })
})
