import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { test } from './upgrade-fixtures'

const VIEWPORT = { width: 412, height: 915 }
const MAX_PANEL_HEIGHT = VIEWPORT.height * 0.85
const SAFE_AREA_BOTTOM = 34
const BODY_PADDING = 24

test.use({ appLocale: 'pt-BR', viewport: VIEWPORT })

/**
 * Headless Chromium reports no safe area, so a sheet that reserves nothing measures like one that does.
 * The override sets the document's `env()` values without `viewport-fit=cover` and survives each load.
 * https://github.com/chromium/chromium/blob/151.0.7922.34/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc#L68-L91
 */
async function overrideSafeAreaInsets(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: SAFE_AREA_BOTTOM } })
}

/**
 * Every sheet here runs under a real inset. Before the panel reserved it, the actions row padded
 * itself to the inset, so its box reached the viewport bottom and an actions-less sheet reserved nothing.
 */
test.beforeEach(async ({ page }) => {
  await overrideSafeAreaInsets(page)
})

async function measureSheet(panel: Locator) {
  await panel.evaluate(() => document.fonts.ready.then(() => undefined))
  return panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
    const footer = element.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
    const panelBounds = element.getBoundingClientRect()
    const panelStyle = getComputedStyle(element)
    const bodyBounds = body.getBoundingClientRect()
    const bodyStyle = getComputedStyle(body)
    /** A flex item keeps its margins, and the grabber sits 12px below the panel's top edge. */
    const outerHeight = (child: Element) => {
      const childStyle = getComputedStyle(child)
      return child.getBoundingClientRect().height
        + Number.parseFloat(childStyle.marginTop)
        + Number.parseFloat(childStyle.marginBottom)
    }
    const stackedHeight = Array.from(element.children)
      .filter((child) => getComputedStyle(child).display !== 'none')
      .reduce((total, child) => total + outerHeight(child), 0)
    const lastChild = body.lastElementChild!.getBoundingClientRect()
    const probe = document.createElement('div')
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
    document.body.append(probe)
    const bottomInset = Number.parseFloat(getComputedStyle(probe).paddingBottom)
    probe.remove()
    return {
      panelHeight: panelBounds.height,
      panelPaddingBottom: Number.parseFloat(panelStyle.paddingBottom),
      stackedHeight: stackedHeight + Number.parseFloat(panelStyle.paddingBottom),
      bodyHeight: bodyBounds.height,
      bodyContentHeight: lastChild.bottom - bodyBounds.top + Number.parseFloat(bodyStyle.paddingBottom),
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      bodyPaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
      bodyPaddingLeft: Number.parseFloat(bodyStyle.paddingLeft),
      bodyPaddingRight: Number.parseFloat(bodyStyle.paddingRight),
      lastContentBottomGap: bodyBounds.bottom - lastChild.bottom,
      footerBottomGap: innerHeight - footer.getBoundingClientRect().bottom,
      actionBottomGap: innerHeight - Array.from(footer.querySelectorAll('button')).at(-1)!.getBoundingClientRect().bottom,
      bottomInset,
    }
  })
}

test('a short confirmation fits its content and keeps its actions above the safe area', async ({ page, context }) => {
  const notifications = notificationsResponseSchema.parse({
    items: [{
      id: 'sheet-layout-notification',
      title: 'Aviso',
      body: 'Texto do aviso',
      url: null,
      habitId: null,
      isRead: false,
      createdAtUtc: '2026-09-04T12:00:00Z',
    }],
    unreadCount: 1,
  })
  await context.route(new RegExp(`${API.notifications.list}$`), (route) => route.fulfill({ json: notifications }))
  await page.goto('/notifications')
  await page.getByRole('button', { name: messages.notifications.deleteAll }).click()
  const panel = page.getByRole('dialog', { name: messages.notifications.deleteAllConfirmTitle })
  await expect(panel).toBeVisible()

  const measured = await measureSheet(panel)
  process.stdout.write(`delete-all confirmation: panel=${measured.panelHeight}px, actions clear the bottom by ${measured.actionBottomGap}px\n`)
  expect(measured.bottomInset).toBe(SAFE_AREA_BOTTOM)
  expect(measured.bodyPaddingBottom).toBe(BODY_PADDING)
  expect(measured.bodyPaddingLeft).toBe(BODY_PADDING)
  expect(measured.bodyPaddingRight).toBe(BODY_PADDING)
  expect(measured.lastContentBottomGap).toBeCloseTo(BODY_PADDING, 0)
  expect(Math.abs(measured.bodyHeight - measured.bodyContentHeight)).toBeLessThanOrEqual(1)
  expect(Math.abs(measured.panelHeight - measured.stackedHeight)).toBeLessThanOrEqual(1)
  expect(measured.panelHeight).toBeLessThan(MAX_PANEL_HEIGHT)
  expect(measured.panelPaddingBottom).toBe(measured.bottomInset)
  expect(measured.footerBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
  expect(measured.actionBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
})

test('a short widget sheet has one bottom inset below its last line', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: messages.profile.widgetTitle }).click()
  const panel = page.getByRole('dialog', { name: messages.profile.widgetTitle })
  await expect(panel).toBeVisible()
  await panel.evaluate(() => document.fonts.ready.then(() => undefined))
  const measured = await panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
    const rows = body.querySelectorAll('li')
    const bodyStyle = getComputedStyle(body)
    return {
      panelHeight: element.getBoundingClientRect().height,
      bodyPaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
      bodyPaddingLeft: Number.parseFloat(bodyStyle.paddingLeft),
      bodyPaddingRight: Number.parseFloat(bodyStyle.paddingRight),
      lastRowBottomGap: body.getBoundingClientRect().bottom - rows[rows.length - 1]!.getBoundingClientRect().bottom,
    }
  })
  expect(measured.panelHeight).toBeLessThan(MAX_PANEL_HEIGHT)
  expect(measured.bodyPaddingBottom).toBe(BODY_PADDING)
  expect(measured.bodyPaddingLeft).toBe(BODY_PADDING)
  expect(measured.bodyPaddingRight).toBe(BODY_PADDING)
  expect(measured.lastRowBottomGap).toBeCloseTo(BODY_PADDING, 0)
})

test('a long creation sheet scrolls under its pinned safe area footer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: messages.habits.createManually }).click()
  const panel = page.getByRole('dialog', { name: messages.habits.form.newHabit })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: messages.habits.form.moreDetails }).click()
  await expect(panel.locator('.habit-form-disclosure[data-open="true"]')).toBeVisible()

  const measured = await measureSheet(panel)
  process.stdout.write(`habit creation: panel=${measured.panelHeight}px, actions clear the bottom by ${measured.actionBottomGap}px\n`)
  expect(measured.bottomInset).toBe(SAFE_AREA_BOTTOM)
  expect(measured.panelHeight).toBeLessThanOrEqual(MAX_PANEL_HEIGHT + 1)
  expect(measured.bodyScrollHeight).toBeGreaterThan(measured.bodyClientHeight)
  expect(measured.panelPaddingBottom).toBe(measured.bottomInset)
  expect(measured.footerBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
  expect(measured.actionBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
})

/**
 * The panel, not the actions row, reserves the bottom inset, so a sheet that carries no actions
 * keeps its last row above the home indicator too. Before that move the reservation lived in
 * `.orbit-sheet-actions`, which this sheet never renders.
 */
test('a menu sheet without actions keeps its last row above the safe area', async ({ page, context }) => {
  const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
    items: [habitScheduleItemSchema.parse(makeHabitScheduleItem({
      title: 'Beber água',
      dueDate: '2026-09-03',
      scheduledDates: ['2026-09-03'],
      children: [],
      hasSubHabits: false,
    }))],
    page: 1,
    pageSize: 200,
    totalCount: 1,
    totalPages: 1,
  })
  await context.route(new RegExp(`${API.habits.list}[?]`), (route) => route.fulfill({ json: habitsPage }))
  await page.goto('/?date=2026-09-03')
  await page.getByRole('button', { name: messages.habits.listOptions }).click()
  const panel = page.getByRole('dialog', { name: messages.habits.listOptions })
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-slot="sheet-actions"]')).toHaveCount(0)

  const measured = await panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
    const items = body.querySelectorAll<HTMLElement>('[role="menuitem"]')
    const probe = document.createElement('div')
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
    document.body.append(probe)
    const bottomInset = Number.parseFloat(getComputedStyle(probe).paddingBottom)
    probe.remove()
    return {
      panelHeight: element.getBoundingClientRect().height,
      panelPaddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
      itemCount: items.length,
      lastItemBottomGap: innerHeight - items[items.length - 1]!.getBoundingClientRect().bottom,
      bottomInset,
    }
  })
  process.stdout.write(`list menu sheet: panel=${measured.panelHeight}px, last row clears the bottom by ${measured.lastItemBottomGap}px\n`)
  expect(measured.bottomInset).toBe(SAFE_AREA_BOTTOM)
  expect(measured.itemCount).toBeGreaterThan(0)
  expect(measured.panelHeight).toBeLessThan(MAX_PANEL_HEIGHT)
  expect(measured.panelPaddingBottom).toBe(SAFE_AREA_BOTTOM)
  expect(measured.lastItemBottomGap).toBeGreaterThanOrEqual(SAFE_AREA_BOTTOM)
})
