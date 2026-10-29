vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { calendarDayCardDate, makeCalendarDayCardEntries } from '@orbit/shared/test-support/calendar-day-card-fixtures'
import { Switch } from '@/components/ui/switch'
import { CheckRow } from '@/components/ui/check-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import type { CalendarSyncEvent } from '@orbit/shared'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { readExpandedControlGeometry } from '@/e2e/layout/expanded-control-geometry'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, uses24HourClock: true }) }) }))

const locales = [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }]

const events: CalendarSyncEvent[] = Array.from({ length: 21 }, (_, index) => ({
  id: `event-${index}`, title: index === 0 ? '1:1 FutureProofing Engineering' : `Evento ${index}`,
  description: null, startDate: '2026-09-12', startTime: '09:00', endTime: null,
  isRecurring: false, recurrenceRule: null, reminders: [], calendarName: 'Trabalho',
}))

function expectWholeLabels(labels: { text: string | null; besideIcon: boolean | null; lines: number; clipped: boolean }[], scale: number) {
  for (const label of labels) {
    expect(label.clipped, JSON.stringify(label)).toBe(false)
    if (scale !== 1) continue
    expect(label.lines, JSON.stringify(label)).toBe(1)
    if (label.besideIcon !== null) expect(label.besideIcon, JSON.stringify(label)).toBe(true)
  }
}

describe('day card compact geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412].flatMap(width => locales.map(locale => ({ width, ...locale }))))('fits the recurring switch label at $width in $locale', async ({ width, locale, messages }) => {
    const { container } = render(<div style={{ width: width - 80 }}><Switch label={messages.calendar.showRecurringShort} checked onChange={vi.fn()} /></div>)
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.locator('[data-slot="list-row-title"]').evaluate(label => {
        const range = document.createRange()
        range.selectNodeContents(label)
        return { text: label.textContent, width: label.getBoundingClientRect().width, lines: new Set([...range.getClientRects()].map(box => Math.round(box.top))).size }
      })
      expect(measured.lines, JSON.stringify(measured)).toBe(1)
    } finally { await page.close() }
  })

  it.each(['light', 'dark'] as const)('keeps the day circle target and one circular focus indicator in %s mode', async (mode) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CalendarDayDetail dateStr={calendarDayCardDate} today={calendarDayCardDate}
        entries={makeCalendarDayCardEntries()} calendarEvents={[]} calendarEventsState="ready" loggable showRecurring
        pendingEntryStates={new Map()} onEntryChange={() => null} onRetryCalendarEvents={vi.fn()}
        onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 412, height: 1000 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="${mode}" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
      const control = page.getByRole('checkbox').first()
      await control.focus()
      const geometry = await control.evaluate((button) => {
        const fill = button.querySelector<HTMLElement>('[data-press-fill]')!
        const icon = button.querySelector<SVGElement>('svg')!
        const box = fill.getBoundingClientRect()
        const visible = icon.getBoundingClientRect()
        const fillStyle = getComputedStyle(fill)
        return { width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, fillWidth: box.width, fillHeight: box.height, radius: fillStyle.borderRadius,
          iconWidth: visible.width, iconHeight: visible.height,
          iconInsets: [visible.left - box.left, box.right - visible.right, visible.top - box.top, box.bottom - visible.bottom],
          focus: fillStyle.outlineWidth, offset: fillStyle.outlineOffset,
          buttonFocus: getComputedStyle(button).outlineStyle, shadow: fillStyle.boxShadow,
          pseudoRadius: getComputedStyle(button, '::before').borderRadius,
          hit: document.elementFromPoint(box.left + 1, box.top + box.height / 2) === button,
          focused: button.matches(':focus-visible') }
      })
      expect(geometry).toEqual({ width: 24, height: 24, fillWidth: 40, fillHeight: 40, radius: '50%', iconWidth: 24, iconHeight: 24, iconInsets: [8, 8, 8, 8],
        focus: '2px', offset: '-2px', buttonFocus: 'none', shadow: 'none', pseudoRadius: '50%', hit: true, focused: true })
      const target = await control.evaluate(readExpandedControlGeometry)
      expect(target.width).toBe(56)
      expect(target.height).toBe(56)
      expect(target.edgeHits).toEqual([true, true, true, true])
      await page.emulateMedia({ forcedColors: 'active' })
      expect(await control.evaluate((button) => ({ button: getComputedStyle(button).outlineStyle, fill: getComputedStyle(button.querySelector('[data-press-fill]')!).outlineWidth }))).toEqual({ button: 'none', fill: '2px' })
    } finally { await page.close() }
  })

  it.each([false, true].flatMap(loggable => ['light', 'dark'].map(mode => ({ loggable, mode }))))('keeps one focus indicator and inset row and switch feedback with loggable=$loggable in $mode', async ({ loggable, mode }) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div style={{ padding: 16 }}><CalendarDayDetail dateStr={calendarDayCardDate} today={calendarDayCardDate}
        entries={makeCalendarDayCardEntries()} calendarEvents={[]} calendarEventsState="ready" loggable={loggable} showRecurring
        pendingEntryStates={new Map()} onEntryChange={() => null} onRetryCalendarEvents={vi.fn()}
        onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 412, height: 1800 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode === 'light' ? 'light' : 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
      await loadAppFonts(page)
      const title = page.locator('section [data-personal-text]').first()
      const row = loggable ? title.locator('xpath=ancestor::*[@data-personal-text-action]').locator('button') : title.locator('xpath=ancestor::button')
      for (const control of [row, page.getByRole('switch')]) {
        await control.focus()
        const focus = await control.evaluate(button => {
          const fill = button.querySelector('[data-press-fill]')
          const style = getComputedStyle(fill ?? button, fill ? null : '::before')
          return { own: getComputedStyle(button).outlineStyle, width: style.outlineWidth, radius: style.borderRadius, offset: style.outlineOffset, shadow: style.boxShadow }
        })
        expect(focus).toEqual({ own: 'none', width: '2px', radius: '12px', offset: '-2px', shadow: 'none' })
        const box = await control.boundingBox()
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
        await page.mouse.down()
        try {
          await expect.poll(() => control.evaluate(button => {
            const element = button.querySelector('[data-press-fill]')
            return getComputedStyle(element ?? button, element ? null : '::before').backgroundColor
          })).not.toBe('rgba(0, 0, 0, 0)')
          const fill = await control.evaluate(button => {
            const element = button.querySelector<HTMLElement>('[data-press-fill]')
            const style = getComputedStyle(element ?? button, element ? null : '::before')
            const content = button.parentElement!.querySelector('[data-personal-text-content]') ?? button
            const graphic = content.querySelector('[aria-hidden="true"]')
            const contentBox = (graphic ?? content.querySelector('[data-slot="list-row-title"]')!).getBoundingClientRect()
            const bounds = button.getBoundingClientRect()
            return { painted: style.backgroundColor !== 'rgba(0, 0, 0, 0)', insetTop: Number.parseFloat(style.top), insetBottom: Number.parseFloat(style.bottom), contentClearance: contentBox.top - bounds.top - Number.parseFloat(style.top) }
          })
          expect(fill.painted).toBe(true)
          expect(fill.insetTop).toBe(8)
          expect(fill.insetBottom).toBe(8)
          expect(fill.contentClearance).toBeGreaterThanOrEqual(4)
        } finally { await page.mouse.up() }
      }
    } finally { await page.close() }
  })

  it.each([320, 412, 1280, 1352].flatMap((width) => [false, true].flatMap((loggable) => locales.map(({ locale, messages }) => ({ width, loggable, locale, messages })))))('keeps every habit row at the drawn floor at $width with loggable=$loggable in $locale', async ({ width, loggable, locale, messages }) => {
    const entries = makeCalendarDayCardEntries()
    expect(entries.map((entry) => entry.habitId)).toEqual(['parent-0', 'parent-1', 'parent-2', 'child-0', 'child-1'])
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ padding: 16, maxWidth: 740 }}><CalendarDayDetail dateStr={calendarDayCardDate} today={calendarDayCardDate}
        entries={entries} calendarEvents={[]} calendarEventsState="ready" loggable={loggable} showRecurring pendingEntryStates={new Map()}
        onOpenHabit={vi.fn()} onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
      </div>
      <CheckRow label="Family calendar" textMode="personal" onOpenLabel={vi.fn()} checked={false} onChange={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const heights: number[][] = []
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('section [data-personal-text]')].map((title) => {
          const button = title.closest('button') ?? title.closest('[data-personal-text-action]')!.querySelector('button')!
          const row = button.closest('[data-slot="list-row-body"]') ?? button
          const metadata = title.nextElementSibling as HTMLElement | null
          const titleBox = title.getBoundingClientRect()
          const rowBox = row.getBoundingClientRect()
          const labelBox = button.getBoundingClientRect()
          const rowStyle = getComputedStyle(row)
          const labelStyle = getComputedStyle(button)
          const controlFill = row.querySelector('[role="checkbox"] [data-press-fill]')?.getBoundingClientRect()
          const metadataBox = metadata?.getBoundingClientRect()
          return { height: rowBox.height, labelHeight: labelBox.height, rowPadding: [rowStyle.paddingTop, rowStyle.paddingBottom, rowStyle.paddingLeft, rowStyle.paddingRight], labelPadding: [labelStyle.paddingTop, labelStyle.paddingBottom], labelMargins: [labelStyle.marginTop, labelStyle.marginBottom], fillsRow: labelBox.top === rowBox.top && labelBox.bottom === rowBox.bottom, controlFill: controlFill ? { width: controlFill.width, height: controlFill.height, separated: controlFill.left >= labelBox.right, contained: controlFill.top >= rowBox.top && controlFill.bottom <= rowBox.bottom } : null, minimum: Number.parseFloat(rowStyle.minHeight), title: title.textContent, metadata: metadata?.textContent, metadataSize: metadata ? Number.parseFloat(getComputedStyle(metadata).fontSize) : null, gap: metadataBox ? metadataBox.top - titleBox.bottom : null, contained: metadataBox ? metadataBox.bottom <= rowBox.bottom && metadataBox.left >= rowBox.left && metadataBox.right <= rowBox.right : false, clipped: metadata ? metadata.scrollHeight > metadata.clientHeight || metadata.scrollWidth > metadata.clientWidth : true }
        }))
        expect(rows).toHaveLength(entries.length)
        rows.forEach((row) => {
          expect(row.minimum, JSON.stringify(row)).toBe(68)
          expect(row.height, JSON.stringify(row)).toBeGreaterThanOrEqual(68)
          expect(row.labelHeight, JSON.stringify(row)).toBeGreaterThanOrEqual(68)
          if (loggable) {
            expect(row.rowPadding).toEqual(['0px', '0px', '16px', '16px'])
            expect(row.labelPadding).toEqual(['12px', '12px'])
            expect(row.labelMargins).toEqual(['0px', '0px'])
            expect(row.fillsRow).toBe(true)
            expect(row.controlFill).toEqual({ width: 40, height: 40, separated: true, contained: true })
          }
        })
        rows.forEach((row, index) => {
          expect(row.metadata).toBe(entries[index]!.dueTime ?? messages.calendar.timeGrid.noSetTime)
          expect(row.metadataSize).toBe(12 * scale)
          expect(row.gap).toBeCloseTo(4)
          expect(row.contained).toBe(true)
          expect(row.clipped).toBe(false)
        })
        heights.push(rows.map((row) => row.height))
      }
      for (const index of [0, 1, 3, 4]) {
        expect(heights[0]![index]).toBeCloseTo(70)
        expect(heights[1]![index]).toBeGreaterThan(heights[0]![index]!)
      }
      const calendarRow = page.getByRole('button', { name: 'Family calendar', exact: true })
      expect(await calendarRow.evaluate((button) => getComputedStyle(button.closest('[data-slot="list-row-body"]')!).minHeight)).toBe('52px')
    } finally { await page.close() }
  })

  it.each([320, 360, 384, 412, 1280].flatMap((width) => [false, true].flatMap((loggable) => locales.map(({ locale, messages }) => ({ width, loggable, locale, messages })))))('fits titles and targets at $width with loggable=$loggable in $locale', async ({ width, loggable, locale, messages }) => {
    const openTitle = vi.fn()
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ padding: 16 }}><CalendarDayDetail dateStr="2026-09-12" today="2026-09-12"
        entries={[{ habitId: 'habit-1', title: 'Caminhar pelo bairro depois do trabalho', status: 'completed', isBadHabit: false, dueTime: '08:00', isOneTime: false }, { habitId: 'habit-2', title: 'Ler', status: 'upcoming', isBadHabit: false, dueTime: null, isOneTime: false }]}
        calendarEvents={events} showEventSource calendarEventsState="ready" loggable={loggable} showRecurring pendingEntryStates={new Map()}
        onOpenHabit={openTitle} onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const expandedTargets = await Promise.all((await page.locator('button, a').all()).map(control => control.evaluate(readExpandedControlGeometry)))
        const geometry = await page.evaluate(() => {
          const headline = [...document.querySelectorAll<HTMLElement>('span')].find((span) => span.textContent === '1:1 FutureProofing Engineering')!
          const titleRange = document.createRange()
          titleRange.selectNodeContents(headline)
          const card = document.querySelector('section')!
          const cardBox = card.getBoundingClientRect()
          const groups = [...card.firstElementChild!.children] as HTMLElement[]
          const title = card.querySelector('h2')!
          const summary = title.nextElementSibling!
          const summaryStyle = getComputedStyle(summary)
          const label = card.querySelector<HTMLButtonElement>('button[aria-label="Caminhar pelo bairro depois do trabalho"]')
          const dayRows = [...groups[2]!.children] as HTMLElement[]
          const labels = [...document.querySelectorAll<HTMLElement>('[data-slot="list-row-title"]')].map((label) => {
            const range = document.createRange()
            range.selectNodeContents(label)
            const icon = label.closest('a')?.querySelector('svg')?.getBoundingClientRect()
            const box = label.getBoundingClientRect()
            return { text: label.textContent, besideIcon: icon ? box.left >= icon.right && box.top < icon.bottom && box.bottom > icon.top : null, lines: new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size, clipped: label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth }
          })
          return {
            cardPadding: [getComputedStyle(card).paddingTop, getComputedStyle(card).paddingRight, getComputedStyle(card).paddingBottom, getComputedStyle(card).paddingLeft],
            titleInset: { left: title.getBoundingClientRect().left - cardBox.left, top: title.getBoundingClientRect().top - cardBox.top },
            summaryGap: summary.getBoundingClientRect().top - title.getBoundingClientRect().bottom,
            summaryFont: summaryStyle.fontFamily,
            summarySize: Number.parseFloat(summaryStyle.fontSize),
            groupGaps: groups.slice(1).map((group, index) => group.getBoundingClientRect().top - groups[index]!.getBoundingClientRect().bottom),
            bottomInset: cardBox.bottom - groups.at(-1)!.getBoundingClientRect().bottom,
            rowInsets: [...card.querySelectorAll<HTMLElement>('button:not([role="checkbox"]), a')].map((target) => {
              const fill = target.closest('[data-slot="list-row-body"]') ?? target
              const box = fill.getBoundingClientRect()
              return [box.left - cardBox.left, cardBox.right - box.right]
            }),
            dayGap: dayRows[1]!.getBoundingClientRect().top - dayRows[0]!.getBoundingClientRect().bottom,
            labelMinimum: label ? Number.parseFloat(getComputedStyle(label.closest('[data-slot="list-row-body"]')!).minHeight) : null,
            labelPadding: label ? [getComputedStyle(label.closest('[data-slot="list-row-body"]')!).paddingTop, getComputedStyle(label.closest('[data-slot="list-row-body"]')!).paddingLeft] : null,
            width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            eventClipped: headline.scrollHeight > headline.clientHeight || headline.scrollWidth > headline.clientWidth,
            eventHeight: headline.getBoundingClientRect().height, eventLineHeight: Number.parseFloat(getComputedStyle(headline).lineHeight),
            eventLines: new Set([...titleRange.getClientRects()].map((box) => Math.round(box.top))).size,
            labels,
            targets: [...document.querySelectorAll<HTMLElement>('button, a')].map((target) => {
              const content = target.parentElement?.hasAttribute('data-personal-text-action')
                ? target.parentElement.querySelector('[data-personal-text-content]')!
                : target
              const box = target.getBoundingClientRect()
              const style = getComputedStyle(target)
              return { personalTitle: content.querySelector('[data-personal-text]')?.getAttribute('aria-label'), label: target.getAttribute('aria-label') ?? target.textContent, width: box.width, height: box.height, left: box.left, right: box.right, clipped: [...content.querySelectorAll<HTMLElement>('[data-personal-text], [data-slot="list-row-title"]')].some((label) => label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth), listRow: target.classList.contains('orbit-list-row-body'), inlinePadding: Math.min(Number.parseFloat(style.paddingInlineStart), Number.parseFloat(style.paddingInlineEnd)), blockPadding: Math.min(Number.parseFloat(style.paddingTop), Number.parseFloat(style.paddingBottom)) }
            }),
          }
        })
        expect(geometry.cardPadding).toEqual(['24px', '24px', '24px', '24px'])
        expect(geometry.titleInset).toEqual({ left: 24, top: 24 })
        expect(geometry.summaryGap).toBeCloseTo(4)
        expect(geometry.summaryFont).toContain('Geist Mono')
        expect(geometry.summarySize).toBe(12 * scale)
        expect(geometry.bottomInset).toBeCloseTo(24)
        geometry.groupGaps.forEach((gap) => expect(gap).toBeCloseTo(16))
        geometry.rowInsets.forEach((insets) => expect(insets).toEqual([24, 24]))
        expect(geometry.dayGap).toBeCloseTo(0)
        if (loggable) {
          expect(geometry.labelMinimum).toBeGreaterThanOrEqual(68)
          expect(geometry.labelPadding).toEqual(['0px', '16px'])
        }
        expect(geometry.scrollWidth, JSON.stringify(geometry)).toBe(geometry.width)
        expect(geometry.eventHeight).toBeLessThanOrEqual(geometry.eventLineHeight * 2 + 1)
        if (scale === 1) {
          expect(geometry.eventLines).toBeLessThanOrEqual(2)
          expect(geometry.eventClipped).toBe(false)
        }
        expectWholeLabels(geometry.labels, scale)
        expect(expandedTargets).toHaveLength(geometry.targets.length)
        for (const [index, target] of geometry.targets.entries()) {
          const hit = expandedTargets[index]!
          expect(hit.width, JSON.stringify(target)).toBeGreaterThanOrEqual(48)
          expect(hit.height, JSON.stringify(target)).toBeGreaterThanOrEqual(48)
          expect(hit.left).toBeGreaterThanOrEqual(16)
          expect(hit.right).toBeLessThanOrEqual(width - 16)
          if (target.clipped) {
            expect(target.personalTitle, JSON.stringify(target)).toBeTruthy()
            expect(target.label, JSON.stringify(target)).toContain(target.personalTitle)
          }
          if (target.listRow) {
            expect(target.inlinePadding, JSON.stringify(target)).toBeGreaterThanOrEqual(8)
            expect(target.blockPadding, JSON.stringify(target)).toBeGreaterThanOrEqual(4)
          }
        }
      }
      fireEvent.click(container.querySelector('button[aria-label^="Caminhar pelo bairro"]')!)
      expect(openTitle).toHaveBeenCalledExactlyOnceWith('habit-1')
    } finally { await page.close() }
  })
})
