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
