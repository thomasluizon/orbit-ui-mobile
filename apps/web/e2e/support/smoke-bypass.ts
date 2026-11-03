import { test, type Page, type TestInfo, type Tracing } from '@playwright/test'

function requireUnrecordedRequests(page: Page): void {
  const currentTest = test.info() as TestInfo & { _tracing: { traceOptions(): unknown } }
  const tracing = page.context().tracing as Tracing & {
    _isTracing: boolean
    _harRecorders: Map<string, unknown>
  }
  if (currentTest._tracing.traceOptions() !== undefined
    || tracing._isTracing !== false || tracing._harRecorders.size !== 0) {
    throw new Error('Smoke bypass requires tracing and HAR recording to be off')
  }
}

export async function installSmokeBypass(page: Page): Promise<void> {
  const secret = process.env.SMOKE_BOT_BYPASS
  if (!secret) return
  requireUnrecordedRequests(page)
  const baseOrigin = new URL(process.env.SMOKE_BASE_URL ?? '').origin
  await page.route((url) => url.origin === baseOrigin
    && (url.pathname === '/api/auth/send-code' || url.pathname === '/api/auth/verify-code'), async (route) => {
    requireUnrecordedRequests(page)
    await route.continue({
      headers: { ...route.request().headers(), 'x-orbit-smoke-bypass': secret },
    })
  })
}
