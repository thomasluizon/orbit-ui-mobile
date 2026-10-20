import { render, screen } from '@testing-library/react'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/auth/google/start/route'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import AuthCallbackPage from '@/app/(auth)/auth-callback/page'

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/app/(auth)/auth-callback/auth-callback-content', () => ({
  AuthCallbackContent: ({ pendingWebState }: { pendingWebState: string | null }) =>
    <div>{pendingWebState ?? 'no web attempt'}</div>,
}))

describe('Google callback web ownership', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('passes only the state of the attempt created by the web start route', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    const started = GET(new NextRequest('https://app.useorbit.org/api/auth/google/start?purpose=signin'))
    const pending = started.cookies.get(GOOGLE_OAUTH_COOKIE)!
    const callbackRequest = new NextRequest('https://app.useorbit.org/auth-callback', {
      headers: { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(pending.value)}` },
    })
    mocks.cookies.mockResolvedValue(callbackRequest.cookies)
    render(await AuthCallbackPage())
    const state = new URL(started.headers.get('location')!).searchParams.get('state')!
    expect(screen.getByText(state)).toBeInTheDocument()
    const verifier = JSON.parse(pending.value).verifier as string
    expect(document.body.textContent).not.toContain(verifier)
  })
  it.each([null, 'invalid-json', '{}', '{"state":42}', '{"state":""}'])
  ('does not claim web ownership without a valid pending state: %s', async (pending) => {
    const callbackRequest = new NextRequest('https://app.useorbit.org/auth-callback', {
      headers: pending === null ? {} : { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(pending)}` },
    })
    mocks.cookies.mockResolvedValue(callbackRequest.cookies)
    render(await AuthCallbackPage())
    expect(screen.getByText('no web attempt')).toBeInTheDocument()
  })
})
