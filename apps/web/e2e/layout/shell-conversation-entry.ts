import { expect, type Page } from '@playwright/test'

const COMPACT_FAB_COLUMN = '[data-shell-fab-content]'
const SETTLED_COMPACT_FAB_COLUMN = `${COMPACT_FAB_COLUMN}:not(:has([data-shell-fab-pending]))`

export async function waitForSettledAstraStack(page: Page) {
  await expect(page.locator(SETTLED_COMPACT_FAB_COLUMN)).toBeVisible()
}

export function getShellConversationEntry(page: Page, width: number, messages: {
  nav: { astra: string }
  shell: { astraButton: { open: string } }
}) {
  const wide = width >= 1024
  return page.locator(wide ? '[data-shell-sidebar]' : SETTLED_COMPACT_FAB_COLUMN)
    .getByRole('button', { name: wide ? messages.nav.astra : messages.shell.astraButton.open, exact: true })
}
