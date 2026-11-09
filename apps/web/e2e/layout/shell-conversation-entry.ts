import type { Page } from '@playwright/test'

export function getShellConversationEntry(page: Page, width: number, messages: {
  nav: { astra: string }
  shell: { astraButton: { open: string } }
}) {
  const wide = width >= 1024
  return page.locator(wide ? '[data-shell-sidebar]' : '[data-shell-fab-content]')
    .getByRole('button', { name: wide ? messages.nav.astra : messages.shell.astraButton.open, exact: true })
}
