import { expect, type Page } from '@playwright/test'

const COMPACT_FAB_COLUMN = '[data-shell-fab-content]'

export async function waitForSettledAstraStack(page: Page) {
  await expect(page.locator(COMPACT_FAB_COLUMN)).toBeVisible()
}

export function getShellConversationEntry(page: Page, width: number, messages: {
  shell: { astraButton: { open: string } }
}) {
  return page.locator(width >= 1024 ? '[data-shell-sidebar]' : COMPACT_FAB_COLUMN)
    .getByRole('button', { name: messages.shell.astraButton.open, exact: true })
}
