import { render, waitFor, cleanup } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createNotionCallback } from '@orbit/shared/__tests__/notion-fixtures'
import Callback from '@/app/(auth)/auth-callback/notion/page'
import { useAuthStore } from '@/stores/auth-store'
const mocks = vi.hoisted(() => ({ params: {}, replace: vi.fn(), complete: vi.fn() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.params), useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/actions/profile', () => ({ completeNotion: mocks.complete }))
beforeEach(() => { vi.clearAllMocks(); mocks.params = { code: 'oauth-code', state: 'oauth-state' }; mocks.complete.mockResolvedValue(undefined) })
afterEach(cleanup)
function mount() {
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Account', email: 'account@example.com' })
  render(<Callback />)
}
it('posts code, state and redirect URI once and returns to the AI settings page', async () => {
  mount()
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/profile/ai'))
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(createNotionCallback(`${window.location.origin}/auth-callback/notion`), 'account-a')
})
it('returns a cancelled consent without posting or displaying an error', async () => {
  mocks.params = { error: 'access_denied', state: 'oauth-state' }; mount()
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/profile/ai'))
  expect(mocks.complete).not.toHaveBeenCalled()
})
it.each<Record<string, string>>([{ code: 'oauth-code' }, { error: 'server_error' }])('rejects an incomplete or failed callback', async (params) => {
  mocks.params = params; mount()
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/profile/ai?notionError=1'))
  expect(mocks.complete).not.toHaveBeenCalled()
})
it('returns a failed exchange to the retryable error on the AI settings page', async () => {
  mocks.complete.mockRejectedValue(new Error('Unavailable')); mount()
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/profile/ai?notionError=1'))
})
it('draws the settings skeleton and no spinner while the connection completes', () => {
  mocks.complete.mockReturnValue(new Promise(() => {}))
  mount()
  const skeleton = document.querySelector('[role="progressbar"]')
  expect(skeleton?.getAttribute('aria-label')).toBe('common.loading')
  expect(skeleton?.getAttribute('data-variant')).toBe('settings')
  expect(document.querySelector('.animate-spin')).toBeNull()
})
