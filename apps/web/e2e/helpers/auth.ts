import { type Page, type APIRequestContext } from '@playwright/test'

export interface TestAccount {
  email: string
  code: string
}

const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:5000'

export { API_URL }

/** Parse TEST_ACCOUNTS env var (format: email1:code1,email2:code2,...) */
export function parseTestAccounts(): TestAccount[] {
  const raw = process.env.TEST_ACCOUNTS
  if (!raw) return [{ email: 'qa@useorbit.org', code: '742891' }]
  return raw.split(',').map((pair) => {
    const [email, code] = pair.split(':', 2)
    return { email: email!.trim(), code: code!.trim() }
  })
}

/** Get a test account by worker index (wraps around if more workers than accounts) */
export function getTestAccount(workerIndex: number): TestAccount {
  const accounts = parseTestAccounts()
  return accounts[workerIndex % accounts.length]!
}

export async function loginViaAPI(request: APIRequestContext, account: TestAccount): Promise<string> {
  await request.post(`${API_URL}/api/auth/send-code`, {
    data: { email: account.email, language: 'en' },
  })

  const res = await request.post(`${API_URL}/api/auth/verify-code`, {
    data: { email: account.email, code: account.code, language: 'en' },
  })

  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`)
  }

  const body = await res.json()
  return body.token
}

export async function authenticatePage(page: Page, request: APIRequestContext, account: TestAccount): Promise<string> {
  // Step 1: Login via direct API call
  const token = await loginViaAPI(request, account)
  const authHeaders = { Authorization: `Bearer ${token}` }

  // Step 2: Complete onboarding + dismiss missions + mark all tours completed
  await request.put(`${API_URL}/api/profile/onboarding`, { headers: authHeaders })
  await request.put(`${API_URL}/api/profile/missions/dismiss`, { headers: authHeaders })
  for (const tour of ['habits', 'chat', 'calendar', 'settings']) {
    await request.put(`${API_URL}/api/profile/tour`, { headers: authHeaders, data: { pageName: tour } })
  }

  // Step 3: Subscribe to push notifications to prevent the push prompt banner
  await request.post(`${API_URL}/api/notifications/subscribe`, {
    headers: authHeaders,
    data: { endpoint: 'https://e2e-test.fake/push', p256dh: 'fake-key', auth: 'fake-auth' },
  })

  // Step 4: Set auth cookie directly on browser context
  await page.context().addCookies([{
    name: 'auth_token',
    value: token,
    domain: 'localhost',
    path: '/',
  }])

  // Step 5: Navigate to home
  await page.goto('/')
  await page.waitForLoadState('networkidle').catch(() => {})

  // Step 6: Wait for skeleton loaders to disappear
  await page.waitForFunction(() => {
    const skeletons = document.querySelectorAll('.animate-pulse')
    return skeletons.length === 0
  }, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)

  // Step 7: Dismiss any remaining overlays
  await dismissOverlays(page)

  return token
}

/** Dismiss push prompt banner, trial banner, and any other floating overlays */
export async function dismissOverlays(page: Page) {
  // Dismiss push notification prompt if visible
  const pushPromptClose = page.locator('[data-testid="dismiss-push-prompt"]').first()
  if (await pushPromptClose.isVisible({ timeout: 500 }).catch(() => false)) {
    await pushPromptClose.click({ force: true })
    await page.waitForTimeout(300)
  }

  // Dismiss trial banner close button if visible
  const trialClose = page.locator('[data-testid="dismiss-trial-banner"]').first()
  if (await trialClose.isVisible({ timeout: 500 }).catch(() => false)) {
    await trialClose.click({ force: true })
    await page.waitForTimeout(300)
  }

  // Dismiss any remaining fixed overlays by pressing Escape
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
