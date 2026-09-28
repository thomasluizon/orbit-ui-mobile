import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ACCOUNT_ID_HEADER } from '@/lib/auth-api'

const requestHeaders = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))
vi.mock('@/app/(app)/rendered-account-seed', () => ({
  RenderedAccountSeed: ({ accountId, children }: { accountId: string | null; children: React.ReactNode }) =>
    <div data-account-id={accountId}>{children}</div>,
}))

const { default: AppTemplate } = await import('@/app/(app)/template')

it('passes the proxy account into the client shell before rendering the page', async () => {
  requestHeaders.get.mockReturnValue('account-a')

  const html = renderToString(await AppTemplate({ children: <span>Today</span> }))

  expect(requestHeaders.get).toHaveBeenCalledWith(ACCOUNT_ID_HEADER)
  expect(html).toContain('data-account-id="account-a"')
})
