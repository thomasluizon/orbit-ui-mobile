import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const reloadMock = vi.fn()
const originalLocation = globalThis.location

import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { apiFetch } from '@/lib/api-fetch'
import { useVersionGateStore } from '@/stores/version-gate-store'

describe('UpdateAvailableBanner', () => {
  beforeEach(() => {
    useVersionGateStore.setState({ upgradeRequired: false, minVersion: null })
    reloadMock.mockReset()
    Object.defineProperty(globalThis, 'location', {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when no upgrade is required', () => {
    const { container } = render(<UpdateAvailableBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the banner when an upgrade is required', () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(<UpdateAvailableBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('forceUpdate.banner')).toBeInTheDocument()
  })

  it('reloads the page when the refresh CTA is clicked', () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(<UpdateAvailableBanner />)
    fireEvent.click(screen.getByText('forceUpdate.refresh'))
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('hides when the dismiss button is clicked', () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(<UpdateAvailableBanner />)
    fireEvent.click(screen.getByLabelText('common.dismiss'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders after apiFetch records a 426 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 426,
      json: () => Promise.resolve({ minVersion: '1.5.0' }),
    }))

    await expect(apiFetch('/api/habits')).rejects.toMatchObject({ status: 426 })
    render(<UpdateAvailableBanner />)

    expect(screen.getByRole('status')).toHaveAttribute('data-update-banner')
  })
})
