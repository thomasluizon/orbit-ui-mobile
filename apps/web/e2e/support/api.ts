import type { APIRequestContext } from '@playwright/test'

/** BFF helpers used by setup/teardown and by the Astra spec to assert server
 *  state directly. They reuse the page's session cookie via `page.request`, so
 *  every call is authenticated as the smoke user. */

export async function resetSmokeAccount(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/profile/reset')
  if (!response.ok()) {
    throw new Error(`profile reset failed: ${response.status()} ${await response.text()}`)
  }
}

interface HabitListItem {
  title: string
}

export async function listHabitTitles(request: APIRequestContext): Promise<string[]> {
  const response = await request.get('/api/habits')
  if (!response.ok()) {
    throw new Error(`list habits failed: ${response.status()} ${await response.text()}`)
  }
  const body = (await response.json()) as { items?: HabitListItem[] }
  return (body.items ?? []).map((habit) => habit.title)
}

/** Pre-warms the cold or slow backend paths the specs depend on — the habit list and the
 *  subscription-plans catalog — so a per-test wait never races a cold Render dyno or an
 *  unprimed price catalog. Best-effort: failures are swallowed because the specs that need
 *  these paths assert on them explicitly. */
export async function warmBackend(request: APIRequestContext): Promise<void> {
  await Promise.all([
    request.get('/api/habits').catch(() => undefined),
    request.get('/api/subscriptions/plans').catch(() => undefined),
  ])
}
