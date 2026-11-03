import type { Page } from '@playwright/test'

export async function installSmokeBypass(page: Page): Promise<void> {
  const secret = process.env.SMOKE_BOT_BYPASS
  if (!secret) return
  const baseOrigin = new URL(process.env.SMOKE_BASE_URL ?? '').origin
  await page.route((url) => url.origin === baseOrigin
    && (url.pathname === '/api/auth/send-code' || url.pathname === '/api/auth/verify-code'), async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), 'x-orbit-smoke-bypass': secret },
    })
  })
}
