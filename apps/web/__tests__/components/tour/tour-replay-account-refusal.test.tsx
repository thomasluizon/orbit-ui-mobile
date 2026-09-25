import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  resetTour: vi.fn(),
  push: vi.fn(),
  setQueryData: vi.fn(),
  startFullTour: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: mocks.setQueryData }) }))
vi.mock('@/lib/actions/profile', () => ({ resetTour: mocks.resetTour }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { hasProAccess: true } }) }))
vi.mock('@/stores/tour-store', () => ({
  useTourStore: () => ({ startFullTour: mocks.startFullTour, startSectionReplay: vi.fn() }),
}))
vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { TourReplayModal } from '@/components/tour/tour-replay-modal'

describe('tour replay account refusal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the modal and local tour state when reset is refused', async () => {
    mocks.resetTour.mockRejectedValueOnce(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))
    const onOpenChange = vi.fn()
    render(<TourReplayModal open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'tour.replay.replayAll' }))

    await waitFor(() => expect(mocks.resetTour).toHaveBeenCalledTimes(1))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(mocks.setQueryData).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.startFullTour).not.toHaveBeenCalled()
  })
})
