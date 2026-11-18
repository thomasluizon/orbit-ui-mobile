import { act } from '@testing-library/react'
import type { Mock } from 'vitest'
import type { useLoginFlow } from '@/app/(auth)/login/use-login-flow'

export type LoginFetch = Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export function requestBodyFor(fetchMock: LoginFetch, pathFragment: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([input]) => toUrlString(input).includes(pathFragment))
  if (!call) throw new Error(`no fetch call matched ${pathFragment}`)
  const rawBody = call[1]?.body
  return JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>
}

export function typeCode(result: { current: ReturnType<typeof useLoginFlow> }, code: string) {
  act(() => {
    result.current.onCodeChange(code)
  })
}
