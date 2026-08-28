import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockPush = vi.fn()
const mockResetTour = vi.fn()
const mockSetQueryData = vi.fn()
const mockStartFullTour = vi.fn()
const mockStartSectionReplay = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/app/actions/profile', () => ({
  resetTour: () => mockResetTour(),
}))

vi.mock('@/stores/tour-store', () => ({
  useTourStore: () => ({
    startFullTour: mockStartFullTour,
    startSectionReplay: mockStartSectionReplay,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: true } }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { TourReplayModal } from '@/components/tour/tour-replay-modal'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

/**
 * Replay used to run its navigation and tour start on a 300ms timer rather than
 * from the completed dismissal, so the overlay could be raised while the sheet
 * was still on screen. Both actions have to wait for the dismissal.
 */
describe('TourReplayModal close path', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockResetTour.mockReset()
    mockResetTour.mockImplementation(() => Promise.resolve(undefined))
    mockSetQueryData.mockReset()
    mockStartFullTour.mockReset()
    mockStartSectionReplay.mockReset()
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('starts the full tour only once the dismissal completes', () => {
    const onOpenChange = vi.fn()
    render(<TourReplayModal open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('tour.replay.replayAll'))

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(mockStartFullTour).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()

    sheetTestControls.completeDismissal()

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockPush).toHaveBeenCalledWith('/')
    expect(mockStartFullTour).toHaveBeenCalledTimes(1)
  })

  it('holds the full tour behind the dismissal even when the reset rejects at once', async () => {
    mockResetTour.mockImplementation(() => Promise.reject(new Error('offline')))
    render(<TourReplayModal open onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('tour.replay.replayAll'))
    await Promise.resolve()

    expect(mockStartFullTour).not.toHaveBeenCalled()

    sheetTestControls.completeDismissal()
    await Promise.resolve()

    expect(mockStartFullTour).toHaveBeenCalledTimes(1)
  })

  it('never resets tour progress before the dismissal completes', () => {
    render(<TourReplayModal open onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('tour.replay.replayAll'))

    expect(mockSetQueryData).not.toHaveBeenCalled()
    expect(mockResetTour).not.toHaveBeenCalled()

    sheetTestControls.completeDismissal()

    expect(mockSetQueryData).toHaveBeenCalledTimes(1)
    expect(mockResetTour).toHaveBeenCalledTimes(1)
  })

  it('starts a section replay only once the dismissal completes', () => {
    const onOpenChange = vi.fn()
    render(<TourReplayModal open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('tour.sections.chat'))

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(mockStartSectionReplay).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()

    sheetTestControls.completeDismissal()

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockPush).toHaveBeenCalledWith('/chat')
    expect(mockStartSectionReplay).toHaveBeenCalledWith('chat')
  })
})
