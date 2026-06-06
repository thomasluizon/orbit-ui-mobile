import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}(${JSON.stringify(params)})`
      return key
    }
    return t
  },
}))

const mutateAsync = vi.fn()
const isPendingRef = { current: false }

vi.mock('@/hooks/use-resolve-clarification', () => ({
  useResolveClarification: () => ({
    mutateAsync,
    get isPending() {
      return isPendingRef.current
    },
  }),
}))

import { ClarificationCard } from '@/components/chat/clarification-card'
import type { ClarificationRequest } from '@orbit/shared/types/chat'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const baseClarification: ClarificationRequest = {
  question: 'habits.clarification.questionFallback',
  operationId: '00000000-0000-0000-0000-000000000001',
  missingArgumentKey: 'frequency_unit',
  quickActions: [
    { label: 'habits.clarification.quickAction.daily', value: '{"frequency_unit":"Day","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.weekly', value: '{"frequency_unit":"Week","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.threePerWeek', value: '{"frequency_unit":"Week","frequency_quantity":3,"is_flexible":true}', description: null },
    { label: 'habits.clarification.quickAction.oneTime', value: '{"frequency_unit":null}', description: null },
  ],
}

describe('ClarificationCard', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    isPendingRef.current = false
  })

  it('renders the question and four quick-action buttons', () => {
    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    expect(screen.getByText('habits.clarification.questionFallback')).toBeInTheDocument()
    expect(screen.getByText('habits.clarification.quickAction.daily')).toBeInTheDocument()
    expect(screen.getByText('habits.clarification.quickAction.weekly')).toBeInTheDocument()
    expect(screen.getByText('habits.clarification.quickAction.threePerWeek')).toBeInTheDocument()
    expect(screen.getByText('habits.clarification.quickAction.oneTime')).toBeInTheDocument()
  })

  it('submits the chosen value to the mutation when a button is tapped', async () => {
    mutateAsync.mockResolvedValueOnce({ ok: true, data: { operation: { status: 'Succeeded' } } })

    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('habits.clarification.quickAction.daily'))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        operationId: '00000000-0000-0000-0000-000000000001',
        value: '{"frequency_unit":"Day","frequency_quantity":1}',
      })
    })
  })

  it('shows success state after a successful resolve', async () => {
    mutateAsync.mockResolvedValueOnce({ ok: true, data: { operation: { status: 'Succeeded' } } })

    render(
      <ClarificationCard clarificationRequest={baseClarification} entityName="meditation" />,
      { wrapper: createWrapper() },
    )

    fireEvent.click(screen.getByText('habits.clarification.quickAction.daily'))

    await waitFor(() => {
      expect(screen.getByText(/successCreated/)).toBeInTheDocument()
    })
  })

  it('shows expired error when the resolve returns 404', async () => {
    mutateAsync.mockResolvedValueOnce({ ok: false, error: 'expired', status: 404 })

    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('habits.clarification.quickAction.oneTime'))

    await waitFor(() => {
      expect(screen.getByText('habits.clarification.errorExpired')).toBeInTheDocument()
    })
  })

  it('shows generic error when the resolve fails for other reasons', async () => {
    mutateAsync.mockResolvedValueOnce({ ok: false, error: 'server error', status: 500 })

    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('habits.clarification.quickAction.weekly'))

    await waitFor(() => {
      expect(screen.getByText('habits.clarification.errorGeneric')).toBeInTheDocument()
    })
  })

  it('shows already-resolved error when the resolve returns 409', async () => {
    mutateAsync.mockResolvedValueOnce({ ok: false, error: 'already resolved', status: 409 })

    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('habits.clarification.quickAction.daily'))

    await waitFor(() => {
      expect(screen.getByText('habits.clarification.errorAlreadyResolved')).toBeInTheDocument()
    })
  })

  it('shows expired error when the resolve returns 410 Gone', async () => {
    mutateAsync.mockResolvedValueOnce({ ok: false, error: 'gone', status: 410 })

    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('habits.clarification.quickAction.daily'))

    await waitFor(() => {
      expect(screen.getByText('habits.clarification.errorExpired')).toBeInTheDocument()
    })
  })

  it('shows generic error when HTTP succeeds but operation.status is not Succeeded', async () => {
    mutateAsync.mockResolvedValueOnce({
      ok: true,
      data: { operation: { status: 'Denied', policyReason: 'missing_scope' } },
    })

    render(<ClarificationCard clarificationRequest={baseClarification} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('habits.clarification.quickAction.daily'))

    await waitFor(() => {
      expect(screen.getByText('habits.clarification.errorGeneric')).toBeInTheDocument()
    })
    expect(screen.queryByText(/successCreated/)).not.toBeInTheDocument()
  })
})
