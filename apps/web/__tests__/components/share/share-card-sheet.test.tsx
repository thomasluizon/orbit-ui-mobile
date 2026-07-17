import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const { refetch, recapState } = vi.hoisted(() => ({
  refetch: vi.fn(),
  recapState: { data: undefined as unknown, isLoading: false, isError: true },
}))

vi.mock('@/hooks/use-recap', () => ({
  useRecap: () => ({ ...recapState, refetch }),
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null },
    isSharing: false,
    hasError: false,
    canShareFiles: false,
    share: vi.fn(),
    download: vi.fn(),
  }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div data-testid="share-card-sheet">{children}</div> : null,
}))

vi.mock('@/components/share/share-card', () => ({
  ShareCard: function ShareCard({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
    return <div ref={ref} data-testid="share-card" />
  },
}))

import { ShareCardSheet } from '@/components/share/share-card-sheet'

describe('ShareCardSheet', () => {
  it('announces the fetch error and retries the recap on demand', () => {
    render(<ShareCardSheet open onOpenChange={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('shareCard.error')

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
