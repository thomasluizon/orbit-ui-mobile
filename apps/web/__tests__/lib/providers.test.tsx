import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
}))

vi.mock('@/lib/query-client', () => ({
  getQueryClient: vi.fn().mockReturnValue({}),
}))

vi.mock('@/components/service-worker-bridge', () => ({
  ServiceWorkerBridge: () => <div data-testid="service-worker-bridge" />,
}))

import { Providers } from '@/lib/providers'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

describe('Providers', () => {
  it('wraps children in QueryClientProvider', () => {
    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    )

    expect(screen.getByTestId('query-provider')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('waits for an account before rehydrating account stores', () => {
    const uiRehydrate = vi.spyOn(useUIStore.persist, 'rehydrate')
    const referralRehydrate = vi.spyOn(useReferralPromptStore.persist, 'rehydrate')
    try {
      render(<Providers><div>Ready</div></Providers>)
      expect(uiRehydrate).not.toHaveBeenCalled()
      expect(referralRehydrate).not.toHaveBeenCalled()
    } finally {
      uiRehydrate.mockRestore()
      referralRehydrate.mockRestore()
    }
  })

  it('mounts the push service worker bridge inside the query provider for every app layout', () => {
    render(
      <Providers>
        <div />
      </Providers>,
    )

    expect(screen.getByTestId('query-provider')).toContainElement(
      screen.getByTestId('service-worker-bridge'),
    )
  })
})
