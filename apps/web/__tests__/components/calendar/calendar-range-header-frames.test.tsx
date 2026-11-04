import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { registerChromeLaunchHook } from '@/__tests__/support/chromium'
import { calendarGeometryHarness } from '@/__tests__/support/calendar-header-geometry'

interface HeaderFrame {
  label: { left: number; right: number; center: number }
  chevrons: { left: number; right: number; center: number }[]
}

function expectSeparateChevrons(frame: HeaderFrame) {
  expect(frame.chevrons).toHaveLength(2)
  for (const box of frame.chevrons) {
    expect(Math.abs(frame.label.center - box.center), JSON.stringify(frame)).toBeLessThanOrEqual(2)
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
      const configuration = JSON.parse(document.getElementById('configuration').textContent);
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
        const frames = page.evaluate(async () => {
          const snapshots = []
          for (let frame = 0; frame < 60; frame++) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
            const row = document.querySelector('[data-testid="calendar-range-navigation"]')
            if (!row) continue
            const title = row.querySelector('[data-calendar-period-title]')!
            const bounds = (element: Element) => {
              const box = element.getBoundingClientRect()
              return { left: box.left, right: box.right, center: (box.top + box.bottom) / 2 }
            }
            snapshots.push({ label: bounds(title), chevrons: [...row.querySelectorAll('button')].filter(button => button !== title).map(bounds) })
          }
          return snapshots
        })
        await page.getByRole('radio', { name: messages.calendar.view.range, exact: true }).click()
        await loadAppFonts(page)
        const label = page.locator('[data-calendar-period-title]')
        const initial = await label.innerText()
        await page.getByRole('button', { name: messages.calendar.range.previous, exact: true }).click()
        expect(await label.innerText()).not.toBe(initial)
        await page.getByRole('button', { name: messages.calendar.range.next, exact: true }).click()
        expect(await label.innerText()).toBe(initial)
        const snapshots = await frames
        expect(snapshots.length).toBeGreaterThan(0)
        for (const snapshot of snapshots) expectSeparateChevrons(snapshot)
      } finally { await page.close() }
    },
  )
})
