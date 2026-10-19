import { expect, it, vi } from 'vitest'
import '@/instrumentation-client'

const loaded = vi.hoisted(() => ({ notionImports: 0 }))

vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }))
vi.mock('@orbit/shared/types/notion-connection', async (importOriginal) => {
  loaded.notionImports += 1
  return importOriginal<typeof import('@orbit/shared/types/notion-connection')>()
})

it('starts error reporting without loading unrelated connection code', () => {
  expect(loaded.notionImports).toBe(0)
})
