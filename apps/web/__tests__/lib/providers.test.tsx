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

import { Providers } from '@/lib/providers'

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
})
