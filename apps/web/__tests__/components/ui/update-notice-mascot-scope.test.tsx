import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Sheet } from '@/components/ui/sheet'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { useDesktopUpdateStore } from '@/stores/desktop-update-store'
import { useVersionGateStore } from '@/stores/version-gate-store'

vi.mock('next/navigation', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

const MASCOT = '[data-asset="orbit-mascot"]'

beforeEach(() => {
  useVersionGateStore.setState(useVersionGateStore.getInitialState())
  useDesktopUpdateStore.setState(useDesktopUpdateStore.getInitialState())
})
afterEach(() => {
  useVersionGateStore.setState(useVersionGateStore.getInitialState())
  useDesktopUpdateStore.setState(useDesktopUpdateStore.getInitialState())
})

describe('the update notice inside an overlay', () => {
  it('shows the notice in a destructive confirmation with no Orbit in it', async () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(<ConfirmSheet open destructive title="Delete conversation" message="Permanent action" confirmLabel="Delete" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    await act(async () => {})
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('[data-update-banner]')).toHaveTextContent('forceUpdate.banner')
    expect(dialog.querySelector(MASCOT)).toBeNull()
  })

  it('shows the reload notice in any sheet with no Orbit in it', async () => {
    render(<Sheet title="Options"><p>Body</p></Sheet>)
    await act(async () => {})
    act(() => useVersionGateStore.getState().requireReload('appUpdated'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('[data-update-banner]')).toHaveTextContent('errors.api.appUpdated')
    expect(dialog.querySelector(MASCOT)).toBeNull()
  })

  it('keeps Orbit at 48 in the shell notice outside any overlay', async () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(<UpdateAvailableBanner />)
    await act(async () => {})
    expect(screen.getByRole('status').querySelector(MASCOT)).toHaveAttribute('width', '48')
  })
})
