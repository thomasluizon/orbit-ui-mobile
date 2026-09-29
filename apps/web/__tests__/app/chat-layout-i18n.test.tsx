import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVersionGateStore } from '@/stores/version-gate-store'

const { setApiFetchTranslate } = vi.hoisted(() => ({ setApiFetchTranslate: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated:${key}`,
}))
vi.mock('@/lib/api-fetch', () => ({ setApiFetchTranslate }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/tour/tour-provider', () => ({ TourProvider: () => null }))
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: () => null }))
vi.mock('@/components/motion/route-transition-shell', () => ({
  RouteTransitionShell: ({ children }: { children: React.ReactNode }) => children,
}))

import ChatLayout from '@/app/(chat)/layout'

describe('ChatLayout', () => {
  beforeEach(() => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
  })

  it('registers translations on direct chat entry', async () => {
    render(<ChatLayout><div>Chat</div></ChatLayout>)

    await waitFor(() => expect(setApiFetchTranslate).toHaveBeenCalledTimes(1))
    const translate = setApiFetchTranslate.mock.calls[0]?.[0] as (key: string) => string
    expect(translate('errors.api.appUpdated')).toBe('translated:errors.api.appUpdated')
  })

  it.each([
    ['appUpdated', 'errors.api.appUpdated'],
    ['accountChanged', 'errors.api.accountChanged'],
  ] as const)('keeps %s reload guidance in the chat layout', (reason, message) => {
    render(<ChatLayout><div>Chat</div></ChatLayout>)

    act(() => useVersionGateStore.getState().requireReload(reason))

    expect(screen.getByRole('status')).toHaveTextContent(`translated:${message}`)
    expect(screen.getByRole('button', { name: 'translated:errors.api.reload' })).toBeInTheDocument()
  })
})
