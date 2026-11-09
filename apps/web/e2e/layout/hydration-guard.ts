import { expect, type Locator, type Page } from '@playwright/test'

const HYDRATION_TIMEOUT_MS = 15_000

type ClickOptions = Parameters<Locator['click']>[0]
type FillOptions = Parameters<Locator['fill']>[1]
type FocusOptions = Parameters<Locator['focus']>[0]

/**
 * Playwright treats a server-rendered control as actionable once it is visible and stable, before `hydrateRoot`
 * attaches its handler. React stamps `__reactProps$<random>` on a host element when it attaches that element's
 * props, so the key proves the element can receive a handler (react-dom-client.production.js `internalPropsKey`).
 */
export async function waitForHydratedControl(target: Locator) {
  await expect.poll(
    () => target.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps$'))),
    { message: 'the control must carry its React props before the first interaction', timeout: HYDRATION_TIMEOUT_MS },
  ).toBe(true)
}

export async function clickWhenHydrated(target: Locator, options?: ClickOptions) {
  await waitForHydratedControl(target)
  await target.click(options)
}

export async function fillWhenHydrated(target: Locator, value: string, options?: FillOptions) {
  await waitForHydratedControl(target)
  await target.fill(value, options)
}

export async function focusWhenHydrated(target: Locator, options?: FocusOptions) {
  await waitForHydratedControl(target)
  await target.focus(options)
}

export async function openTodayListOptions(page: Page, label: string) {
  await clickWhenHydrated(page.locator('[data-shell-header] [data-today-header-actions]')
    .getByRole('button', { name: label, exact: true }))
}

export function assertNoHydrationErrors(messages: readonly string[]) {
  const errors = messages.filter((message) =>
    /Minified React error #418\b|react\.dev\/errors\/418\b|Hydration failed because|A tree hydrated but/.test(message))
  if (errors.length > 0) throw new Error(`Layout hydration mismatch:\n${errors.join('\n')}`)
}
