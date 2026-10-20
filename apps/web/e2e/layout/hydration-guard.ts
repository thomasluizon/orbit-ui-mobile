import type { Page } from '@playwright/test'

export async function openTodayListOptions(page: Page, label: string) {
  await page.locator('[data-shell-header] [data-today-header-actions]')
    .getByRole('button', { name: label, exact: true }).click()
}

export function assertNoHydrationErrors(messages: readonly string[]) {
  const errors = messages.filter((message) =>
    /Minified React error #418\b|react\.dev\/errors\/418\b|Hydration failed because|A tree hydrated but/.test(message))
  if (errors.length > 0) throw new Error(`Layout hydration mismatch:\n${errors.join('\n')}`)
}
