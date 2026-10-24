import type { Page } from '@playwright/test'

export function getShellConversationEntry(page: Page, width: number, messages: {
  nav: { astra: string }
  todayAstra: { openConversation: string }
}) {
  const wide = width >= 1024
  return page.locator(wide ? '[data-shell-sidebar]' : '[data-shell-pinned-slot]')
    .getByRole('button', { name: wide ? messages.nav.astra : messages.todayAstra.openConversation, exact: true })
}
