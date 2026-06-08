import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'

const DATE_PARAM = /[?&]date=\d{4}-\d{2}-\d{2}/

test.describe.serial('URL-driven day navigation', () => {
  let token = ''

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
  })

  test.afterAll(async () => {})

  test('bare route has no date param and shows the today nav', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    expect(new URL(page.url()).searchParams.has('date')).toBe(false)

    const dateNav = page.locator('[data-tour="tour-date-nav"]')
    await expect(dateNav).toBeVisible({ timeout: 10000 })
  })

  test('previous day pushes a date query param into the URL', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Previous day' }).click()

    await page.waitForURL(DATE_PARAM, { timeout: 10000 })
    expect(new URL(page.url()).searchParams.get('date')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  test('a pinned day survives a reload', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.waitForURL(DATE_PARAM, { timeout: 10000 })
    const pinnedDate = new URL(page.url()).searchParams.get('date')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    expect(new URL(page.url()).searchParams.get('date')).toBe(pinnedDate)
  })

  test('go-to-today returns to the bare route', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.waitForURL(DATE_PARAM, { timeout: 10000 })

    await page.getByRole('button', { name: 'Go to today' }).click()
    await page.waitForURL((url) => !url.searchParams.has('date'), {
      timeout: 10000,
    })

    expect(new URL(page.url()).searchParams.has('date')).toBe(false)
  })

  test('browser back steps days because each day is its own history entry', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.waitForURL(DATE_PARAM, { timeout: 10000 })
    const firstBack = new URL(page.url()).searchParams.get('date')

    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.waitForURL(
      (url) => url.searchParams.get('date') !== firstBack,
      { timeout: 10000 },
    )

    await page.goBack()
    await page.waitForURL(
      (url) => url.searchParams.get('date') === firstBack,
      { timeout: 10000 },
    )

    expect(new URL(page.url()).searchParams.get('date')).toBe(firstBack)
  })
})
