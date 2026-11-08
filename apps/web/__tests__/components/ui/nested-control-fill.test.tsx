import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import type { Page } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CalendarSyncEvent } from '@orbit/shared'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { makePickListLayoutBlock } from '@orbit/shared/test-support/choice-layout-fixtures'
import en from '@orbit/shared/i18n/en.json'
import { ListRow } from '@/components/ui/list-row'
import { NotificationRow } from '@/components/navigation/notification-row'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { PickListBlock } from '@/components/chat/pick-list-block'
import { HabitBlockRow } from '@/components/chat/habit-block-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))

const event: CalendarSyncEvent = {
  id: 'event', title: 'Weekly planning', calendarName: 'Work calendar', description: 'Review every step.',
  startDate: '2026-07-01', startTime: '09:00', endTime: '10:00', isRecurring: false, recurrenceRule: null, reminders: [],
}

function ImportEventRow() {
  const t = useTranslations()
  return <CalendarSyncEventRow event={event} weekStartDay={1} selected={false} isReviewMode suggestionId="suggestion" dismissPending={false}
    onToggle={vi.fn()} onDismiss={vi.fn()} t={t} />
}

interface Surface {
  name: string
  element: () => ReactElement
  parent: string
  body: string
  nested: string
  paint?: string
}

const surfaces: Surface[] = [
  {
    name: 'Avisos notification row',
    element: () => <ul><NotificationRow item={createMockNotification({ id: 'nested', title: 'Reminder', isRead: false })} onOpen={vi.fn()} onDelete={vi.fn()} /></ul>,
    parent: 'li[data-read]',
    body: '.orbit-notification-row:not(.orbit-notification-delete)',
    nested: '.orbit-notification-delete',
  },
  {
    name: 'list row with a trailing action',
    element: () => <ListRow title="Morning run" description="Every weekday" onClick={vi.fn()} action={{ icon: 'trash', label: 'Remove row', onPress: vi.fn() }} />,
    parent: '.orbit-list-action-surface',
    body: '.orbit-list-row-body',
    nested: '.orbit-list-row-action',
  },
  {
    name: 'calendar import event row',
    element: () => <ImportEventRow />,
    parent: '.orbit-list-action-surface',
    body: '.orbit-list-row-body',
    nested: '.icon-btn',
  },
  {
    name: 'Astra habit block row with a nested check',
    element: () => <PickListBlock block={makePickListLayoutBlock('en')} />,
    parent: '[data-habit-block-row]',
    body: '.orbit-list-row-body',
    nested: '[data-habit-row-control="check"]',
    paint: '[data-habit-check]',
  },
]

function readFills(selectors: { parent: string; nested?: string; paint?: string }) {
  const parent = document.querySelector(selectors.parent)!
  const probe = document.createElement('span')
  probe.style.backgroundColor = 'var(--bg-hover)'
  parent.append(probe)
  const hover = getComputedStyle(probe).backgroundColor
  probe.remove()
  const transparent = (color: string) => /^(transparent|rgba\([^)]*,\s*0\))$/.test(color)
  const hovered = selectors.nested ? parent.querySelector(`${selectors.nested}:hover`) : null
  const nested = hovered && selectors.paint ? hovered.querySelector(selectors.paint) : hovered
  const nestedPaint = nested ? [getComputedStyle(nested).backgroundColor, getComputedStyle(nested, '::before').backgroundColor].find((color) => !transparent(color)) ?? null : null
  return { parent: getComputedStyle(parent, '::before').backgroundColor, hover, nestedPaint }
}

function readText(parentSelector: string) {
  const parent = document.querySelector(parentSelector)!
  const probe = (color: string) => {
    const span = document.createElement('span')
    span.style.color = color
    parent.append(span)
    const value = getComputedStyle(span).color
    span.remove()
    return value
  }
  return { secondary: probe('var(--orbit-list-row-secondary, var(--fg-3))'), tertiary: probe('var(--fg-3)') }
}

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

describe('one active fill for a nested control in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function openSurface(element: ReactElement, mode: 'dark' | 'light') {
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><main style={{ padding: 24, maxWidth: 412 }}>{element}</main></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet} *, *::before, *::after { transition: none !important }</style>${markup}</html>`)
    await page.mouse.move(0, 0)
    await settle(page)
    return page
  }

  it.each((['dark', 'light'] as const).flatMap((mode) => surfaces.map((surface) => ({ ...surface, mode }))))('keeps the $name fill at rest under a nested control in $mode', async ({ element, parent, body, nested, paint, mode }) => {
    const page = await openSurface(element(), mode)
    try {
      const resting = (await page.evaluate(readFills, { parent })).parent
      const controls = page.locator(parent).first().locator(nested)
      expect(await controls.count()).toBeGreaterThan(0)
      for (const control of await controls.all()) {
        await control.hover()
        await settle(page)
        const hovered = await page.evaluate(readFills, { parent, nested, paint })
        expect(hovered.nestedPaint, 'nested control paints the visible neutral hover fill').toBe(hovered.hover)
        expect(hovered.parent, 'parent fill while the nested control is hovered').toBe(resting)
        await page.mouse.down()
        await settle(page)
        const pressed = await page.evaluate(readFills, { parent, nested, paint })
        expect(pressed.nestedPaint, 'nested control paints the visible neutral press fill').toBe(pressed.hover)
        expect(pressed.parent, 'parent fill while the nested control is pressed').toBe(resting)
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
      await controls.first().hover()
      await page.locator(parent).first().locator(body).hover()
      await settle(page)
      const returned = await page.evaluate(readFills, { parent })
      expect(returned.parent, 'parent fill after the pointer moves from the nested control to the body').toBe(returned.hover)
    } finally { await page.close() }
  })

  it.each((['dark', 'light'] as const).flatMap((mode) => surfaces.map((surface) => ({ ...surface, mode }))))('keeps the $name fill and text at rest when a nested control is hovered over the keyboard-focused body in $mode', async ({ element, parent, body, nested, paint, mode }) => {
    const page = await openSurface(element(), mode)
    try {
      const resting = { fill: (await page.evaluate(readFills, { parent })).parent, text: await page.evaluate(readText, parent) }
      for (let step = 0; step < 10 && !(await page.evaluate((selector) => document.activeElement?.matches(selector) ?? false, `${parent} ${body}`)); step += 1) await page.keyboard.press('Tab')
      await settle(page)
      expect(await page.evaluate((selector) => document.activeElement?.matches(`${selector}:focus-visible`) ?? false, `${parent} ${body}`), 'the row body holds keyboard focus').toBe(true)
      const focused = await page.evaluate(readFills, { parent })
      expect(focused.parent, 'the keyboard-focused body lights its row').toBe(focused.hover)
      const controls = page.locator(parent).first().locator(nested)
      expect(await controls.count()).toBeGreaterThan(0)
      for (const control of await controls.all()) {
        await control.hover()
        await settle(page)
        const hovered = await page.evaluate(readFills, { parent, nested, paint })
        expect(hovered.nestedPaint, 'nested control paints the visible neutral hover fill').toBe(hovered.hover)
        expect(hovered.parent, 'parent fill while the nested control is hovered over the focused body').toBe(resting.fill)
        expect(await page.evaluate(readText, parent), 'row text colours while the nested control is hovered over the focused body').toEqual(resting.text)
      }
    } finally { await page.close() }
  })

  it.each(['dark', 'light'] as const)('rests the proposed habit block title when a nested control is hovered over the keyboard-focused body in %s', async (mode) => {
    const page = await openSurface(<HabitBlockRow proposed title="Walk after breakfast" control={<button type="button" aria-label="Choose walk" data-habit-row-control="check">+</button>} />, mode)
    try {
      const colours = () => page.evaluate(() => {
        const parent = document.querySelector('[data-habit-block-row]')!
        const probe = (color: string) => {
          const span = document.createElement('span')
          span.style.color = color
          parent.append(span)
          const value = getComputedStyle(span).color
          span.remove()
          return value
        }
        return { title: getComputedStyle(parent.querySelector('.orbit-list-row-body [data-personal-text]')!).color, rest: probe('var(--fg-3)'), lit: probe('var(--fg-2)') }
      })
      const resting = await colours()
      expect(resting.title, 'the proposed title rests at the tertiary colour').toBe(resting.rest)
      for (let step = 0; step < 10 && !(await page.evaluate(() => document.activeElement?.matches('[data-habit-block-row] .orbit-list-row-body') ?? false)); step += 1) await page.keyboard.press('Tab')
      await settle(page)
      const focused = await colours()
      expect(focused.title, 'the keyboard-focused body lifts the proposed title').toBe(focused.lit)
      await page.getByRole('button', { name: 'Choose walk' }).hover()
      await settle(page)
      const hovered = await colours()
      expect(hovered.title, 'the proposed title follows the resting row while the nested control is hovered over the focused body').toBe(hovered.rest)
    } finally { await page.close() }
  })
})
