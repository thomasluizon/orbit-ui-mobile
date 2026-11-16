import { expect, type Page } from '@playwright/test'

const COMPACT_FAB_COLUMN = '[data-shell-fab-content]'
const SETTLED_COMPACT_FAB_COLUMN = `${COMPACT_FAB_COLUMN}:not(:has([data-shell-fab-pending]))`

export async function waitForSettledAstraStack(page: Page) {
  await expect(page.locator(SETTLED_COMPACT_FAB_COLUMN)).toBeVisible()
}

export function getShellConversationEntry(page: Page, width: number, messages: {
  shell: { astraButton: { open: string } }
}) {
  return page.locator(width >= 1024 ? '[data-shell-sidebar]' : SETTLED_COMPACT_FAB_COLUMN)
    .getByRole('button', { name: messages.shell.astraButton.open, exact: true })
}
