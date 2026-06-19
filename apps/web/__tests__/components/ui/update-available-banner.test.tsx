import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let mockState = { upgradeRequired: false, minVersion: null as string | null }

vi.mock('@/stores/version-gate-store', () => ({
  useVersionGateStore: <T,>(selector: (state: typeof mockState) => T) =>
    selector(mockState),
}))

const reloadMock = vi.fn()
const originalLocation = globalThis.location

import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'

describe('UpdateAvailableBanner', () => {
  beforeEach(() => {
    mockState = { upgradeRequired: false, minVersion: null }
    reloadMock.mockReset()
    Object.defineProperty(globalThis, 'location', {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    })
  })

  it('renders nothing when no upgrade is required', () => {
    mockState = { upgradeRequired: false, minVersion: null }
    const { container } = render(<UpdateAvailableBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the banner when an upgrade is required', () => {
    mockState = { upgradeRequired: true, minVersion: '1.5.0' }
    render(<UpdateAvailableBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('forceUpdate.banner')).toBeInTheDocument()
  })

  it('reloads the page when the refresh CTA is clicked', () => {
    mockState = { upgradeRequired: true, minVersion: '1.5.0' }
    render(<UpdateAvailableBanner />)
    fireEvent.click(screen.getByText('forceUpdate.refresh'))
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('hides when the dismiss button is clicked', () => {
    mockState = { upgradeRequired: true, minVersion: '1.5.0' }
    render(<UpdateAvailableBanner />)
    fireEvent.click(screen.getByLabelText('common.dismiss'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
