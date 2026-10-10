import type { Locator, Page } from '@playwright/test'

export async function inspectDestinationHeading(
  page: Page,
  route: string,
  title: string,
  inspect: (heading: Locator) => Promise<void>,
  visit: () => Promise<unknown> = () => page.goto(route),
): Promise<void> {
  const monitoring = { active: true }
  let rejectRouteError: (error: Error) => void = () => {}
  const routeError = new Promise<never>((_, reject) => { rejectRouteError = reject })
  const onPageError = (error: Error) => rejectRouteError(new Error(`Route ${route} raised an error: ${error.message}`, { cause: error }))
  page.on('pageerror', onPageError)
  const assertNoErrorSurface = async () => {
    if (await page.locator('.error-surface').count() > 0) throw new Error(`Route ${route} rendered .error-surface`)
    if (await page.locator('[role="alert"][aria-live="polite"][aria-atomic="true"]').count() > 0) {
      throw new Error(`Route ${route} rendered an error state`)
    }
  }
  const monitor = (async () => {
    while (monitoring.active) {
      await assertNoErrorSurface()
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
  })()
  const inspectHeading = async () => {
    await visit()
    await assertNoErrorSurface()
    const heading = page.getByRole('heading', { level: 1, name: title, exact: true })
    try {
      await heading.waitFor({ state: 'visible' })
    } catch (cause) {
      throw new Error(`Route ${route} expected heading "${title}"`, { cause })
    }
    await inspect(heading)
    await assertNoErrorSurface()
  }
  try {
    await Promise.race([routeError, monitor, inspectHeading()])
  } finally {
    monitoring.active = false
    page.off('pageerror', onPageError)
    await monitor
  }
}
