import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'

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
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
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

  it('keeps only an empty live region when no upgrade is required', () => {
    render(<UpdateAvailableBanner />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).not.toHaveAttribute('data-update-banner')
  })

  it.each([
    ['a failed Server Action', () => useVersionGateStore.getState().requireReload('appUpdated'), 'errors.api.appUpdated'],
    ['a 426 response', () => useVersionGateStore.getState().markUpgradeRequired('1.5.0'), 'forceUpdate.banner'],
  ])('announces %s through a live region that was already mounted and empty', (_trigger, trigger, message) => {
    render(<UpdateAvailableBanner />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()

    act(trigger)

    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent(message)
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
    fireEvent.click(screen.getByRole('button', { name: 'versionUpdate.laterCta' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('protects the brand line and leaves reload guidance translatable', () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    const { container } = render(<UpdateAvailableBanner />)
    expect(container.querySelector('[data-update-banner] p')).toHaveAttribute('translate', 'no')

    act(() => useVersionGateStore.getState().requireReload('accountChanged'))
    expect(container.querySelector('[data-update-banner] p')).not.toHaveAttribute('translate')
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
