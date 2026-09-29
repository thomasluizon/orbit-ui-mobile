import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/pt-BR.json'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { test } from './upgrade-fixtures'

const VIEWPORT = { width: 412, height: 915 }
const MAX_PANEL_HEIGHT = VIEWPORT.height * 0.85

test.use({ appLocale: 'pt-BR', viewport: VIEWPORT })

async function measureSheet(panel: Locator) {
  await panel.evaluate(() => document.fonts.ready.then(() => undefined))
  return panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
    const footer = element.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
    const panelBounds = element.getBoundingClientRect()
    const panelStyle = getComputedStyle(element)
    const bodyBounds = body.getBoundingClientRect()
    const bodyStyle = getComputedStyle(body)
    const stackedHeight = Array.from(element.children)
      .filter((child) => getComputedStyle(child).display !== 'none')
      .reduce((total, child) => total + child.getBoundingClientRect().height, 0)
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
  expect(Math.abs(measured.bodyHeight - measured.bodyContentHeight)).toBeLessThanOrEqual(1)
  expect(Math.abs(measured.panelHeight - measured.stackedHeight)).toBeLessThanOrEqual(1)
  expect(measured.panelHeight).toBeLessThan(MAX_PANEL_HEIGHT)
  expect(measured.panelPaddingBottom).toBe(measured.bottomInset)
  expect(measured.footerBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
  expect(measured.actionBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
})

test('a long creation sheet scrolls under its pinned safe area footer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: messages.habits.createManually }).click()
  const panel = page.getByRole('dialog', { name: messages.habits.createHabit })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: messages.habits.form.moreDetails }).click()
  await expect(panel.locator('.habit-form-disclosure[data-open="true"]')).toBeVisible()

  const measured = await measureSheet(panel)
  process.stdout.write(`habit creation: panel=${measured.panelHeight}px, actions clear the bottom by ${measured.actionBottomGap}px\n`)
  expect(measured.panelHeight).toBeLessThanOrEqual(MAX_PANEL_HEIGHT + 1)
  expect(measured.bodyScrollHeight).toBeGreaterThan(measured.bodyClientHeight)
  expect(measured.panelPaddingBottom).toBe(measured.bottomInset)
  expect(measured.footerBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
  expect(measured.actionBottomGap).toBeGreaterThanOrEqual(measured.bottomInset)
})
