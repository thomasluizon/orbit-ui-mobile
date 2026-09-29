import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/pt-BR.json'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { test } from './upgrade-fixtures'

test.use({ appLocale: 'pt-BR', viewport: { width: 412, height: 915 } })

async function measureSheet(panel: Locator) {
  return panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
    const footer = element.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
    const panelBounds = element.getBoundingClientRect()
    const bodyBounds = body.getBoundingClientRect()
    const footerBounds = footer.getBoundingClientRect()
    const stackedHeight = Array.from(element.children)
      .filter((child) => getComputedStyle(child).display !== 'none')
      .reduce((height, child) => height + child.getBoundingClientRect().height, 0)
    const lastChild = body.lastElementChild!.getBoundingClientRect()
    const bottomPadding = Number.parseFloat(getComputedStyle(body).paddingBottom)
    const safeAreaProbe = document.createElement('div')
    safeAreaProbe.style.paddingBottom = 'env(safe-area-inset-bottom)'
    document.body.append(safeAreaProbe)
    const bottomInset = Number.parseFloat(getComputedStyle(safeAreaProbe).paddingBottom)
    safeAreaProbe.remove()
    return {
      panelHeight: panelBounds.height,
      stackedHeight,
      bodyHeight: bodyBounds.height,
      bodyContentHeight: lastChild.bottom - bodyBounds.top + bottomPadding,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      footerDistance: innerHeight - footerBounds.bottom,
      actionDistance: innerHeight - Array.from(footer.querySelectorAll('button')).at(-1)!.getBoundingClientRect().bottom,
      bottomInset,
    }
  })
}

test('a short confirmation fits its content and keeps actions above the safe area', async ({ page, context }) => {
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
  await context.route(`**${API.notifications.list}`, (route) => route.fulfill({ json: notifications }))
  await page.goto('/notifications')
  await page.getByRole('button', { name: messages.notifications.deleteAll }).click()
  const panel = page.getByRole('dialog', { name: messages.notifications.deleteAllConfirmTitle })
  await expect(panel).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  const measured = await measureSheet(panel)
  process.stdout.write(`notification confirmation: panel=${measured.panelHeight}px, footer inset distance=${measured.actionDistance}px\n`)
  expect(measured.bodyHeight).toBeCloseTo(measured.bodyContentHeight, 0)
  expect(measured.panelHeight).toBeCloseTo(measured.stackedHeight, 0)
  expect(measured.panelHeight).toBeLessThan(915 * 0.85)
  expect(measured.actionDistance).toBeGreaterThanOrEqual(measured.bottomInset)
})

test('a long creation sheet scrolls under its pinned safe area footer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: messages.habits.createManually }).click()
  const panel = page.getByRole('dialog', { name: messages.habits.createHabit })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: messages.habits.form.moreDetails }).click()
  await page.evaluate(() => document.fonts.ready)

  const measured = await measureSheet(panel)
  process.stdout.write(`habit creation: panel=${measured.panelHeight}px, footer inset distance=${measured.actionDistance}px\n`)
  expect(measured.panelHeight).toBeLessThanOrEqual(915 * 0.85 + 1)
  expect(measured.bodyScrollHeight).toBeGreaterThan(measured.bodyClientHeight)
  expect(measured.actionDistance).toBeGreaterThanOrEqual(measured.bottomInset)
})
