import type { Page } from '@playwright/test'

const HYDRATION_TIMEOUT_MS = 15_000

/**
 * Playwright clicks server HTML before `hydrateRoot` attaches a handler, and the click is lost. `hydrateRoot` sets
 * `__reactContainer$<random>` on `document` and attaches every listener in one call, after which React replays a
 * click that arrives before hydration finishes (react-dom-client.production.js and .development.js).
 */
export async function waitForHydrationRoot(page: Page) {
  await page.waitForFunction(
    () => Object.keys(document).some((key) => key.startsWith('__reactContainer$')),
    undefined,
    { timeout: HYDRATION_TIMEOUT_MS },
  )
}

export async function openTodayListOptions(page: Page, label: string) {
  await page.locator('[data-shell-header] [data-today-header-actions]')
    .getByRole('button', { name: label, exact: true }).click()
}

export function assertNoHydrationErrors(messages: readonly string[]) {
  const errors = messages.filter((message) =>
    /Minified React error #418\b|react\.dev\/errors\/418\b|Hydration failed because|A tree hydrated but/.test(message))
  if (errors.length > 0) throw new Error(`Layout hydration mismatch:\n${errors.join('\n')}`)
}
