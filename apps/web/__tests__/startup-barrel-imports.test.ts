import { expect, it, vi } from 'vitest'

vi.mock('@/lib/server-fetch', () => ({ serverAuthFetch: vi.fn() }))

const loaded = vi.hoisted(() => ({ notionImports: 0 }))
vi.mock('@orbit/shared/types/notion-connection', async (importOriginal) => {
  loaded.notionImports += 1
  return importOriginal<typeof import('@orbit/shared/types/notion-connection')>()
})

it('keeps unrelated connection schemas out of client action startup', async () => {
  await import('@/lib/client-action')
  expect(loaded.notionImports).toBe(0)
})

it('keeps unrelated connection schemas out of theme startup', async () => {
  await import('@/lib/theme-dom')
  expect(loaded.notionImports).toBe(0)
})

it('keeps unrelated connection schemas out of upload startup', async () => {
  await import('@/lib/upload-file')
  expect(loaded.notionImports).toBe(0)
})

it('keeps unrelated connection schemas out of push preference startup', async () => {
  await import('@/hooks/use-push-notification-preferences')
  expect(loaded.notionImports).toBe(0)
})
