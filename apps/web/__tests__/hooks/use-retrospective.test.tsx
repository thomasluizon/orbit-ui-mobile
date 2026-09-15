import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useProgressRetrospective } from '@/hooks/use-retrospective'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const originalLocation = globalThis.location
const mockFetch = vi.fn()

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useProgressRetrospective', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('keeps a retrospective PAY_GATE on Progress for the locked window', async () => {
    const locationOnProgress = {
      href: 'https://app.useorbit.org/progress',
      pathname: '/progress',
    }
    Object.defineProperty(globalThis, 'location', {
      value: locationOnProgress,
      writable: true,
      configurable: true,
    })
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({
        error: 'Retrospectives are a Pro feature. Upgrade to unlock!',
        errorCode: 'PAY_GATE',
      }),
    })

    const { result } = renderHook(() => useProgressRetrospective(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(locationOnProgress.href).toBe('https://app.useorbit.org/progress')
  })
})
