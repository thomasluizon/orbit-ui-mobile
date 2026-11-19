import { expect, type Page } from '@playwright/test'

const COMPACT_FAB_COLUMN = '[data-shell-fab-content]'

const PENDING_REGION = '[role="progressbar"], [aria-busy="true"]'

/** The column draws on the first frame. The create button leaves it once an empty Today settles, so wait for every pending region first. */
export async function waitForSettledAstraStack(page: Page) {
  await expect(page.locator(COMPACT_FAB_COLUMN)).toBeVisible()
  await expect(page.locator(PENDING_REGION)).toHaveCount(0)
}

export function getShellConversationEntry(page: Page, width: number, messages: {
  shell: { astraButton: { open: string } }
}) {
  return page.locator(width >= 1024 ? '[data-shell-sidebar]' : COMPACT_FAB_COLUMN)
    .getByRole('button', { name: messages.shell.astraButton.open, exact: true })
}
