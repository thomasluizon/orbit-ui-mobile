import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  it('registers translations on direct chat entry', async () => {
    render(<ChatLayout><div>Chat</div></ChatLayout>)

    await waitFor(() => expect(setApiFetchTranslate).toHaveBeenCalledTimes(1))
    const translate = setApiFetchTranslate.mock.calls[0]?.[0] as (key: string) => string
    expect(translate('errors.api.appUpdated')).toBe('translated:errors.api.appUpdated')
  })
})
