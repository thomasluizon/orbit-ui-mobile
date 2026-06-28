import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const { pushMock, setActiveSettingsPanelMock, shellState } = vi.hoisted(() => {
  const setActiveSettingsPanelMock = vi.fn()
  return {
    pushMock: vi.fn(),
    setActiveSettingsPanelMock,
    shellState: {
      activeSettingsPanel: null as string | null,
      setActiveSettingsPanel: setActiveSettingsPanelMock,
    },
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: typeof shellState) => unknown) => selector(shellState),
}))

import { SettingsShell } from '@/components/settings/settings-shell'

const PANEL_LABELS = [
  'nav.profile',
  'preferences.title',
  'aiSettings.title',
  'advancedSettings.title',
  'about.title',
  'profile.support.title',
]

describe('SettingsShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shellState.activeSettingsPanel = null
  })

  it('renders one nav button per settings panel with its title label', () => {
    render(
      <SettingsShell panel="preferences">
        <p>Panel body</p>
      </SettingsShell>,
    )
    const nav = screen.getByRole('navigation')

    expect(within(nav).getAllByRole('button')).toHaveLength(PANEL_LABELS.length)
    for (const label of PANEL_LABELS) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('renders the active panel children alongside the nav', () => {
    render(
      <SettingsShell panel="about">
        <p>Panel body</p>
      </SettingsShell>,
    )

    expect(screen.getByText('Panel body')).toBeInTheDocument()
  })

  it('updates the active panel and routes when a nav item is selected', () => {
    render(
      <SettingsShell panel="profile">
        <p>Panel body</p>
      </SettingsShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'preferences.title' }))

    expect(setActiveSettingsPanelMock).toHaveBeenCalledWith('preferences')
    expect(pushMock).toHaveBeenCalledWith('/preferences')
  })

  it('marks the current panel prop as the active nav item', () => {
    render(
      <SettingsShell panel="preferences">
        <p>Panel body</p>
      </SettingsShell>,
    )

    expect(
      screen.getByRole('button', { name: 'preferences.title' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'nav.profile' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('lets the store active panel override the prop for the highlight', () => {
    shellState.activeSettingsPanel = 'about'

    render(
      <SettingsShell panel="preferences">
        <p>Panel body</p>
      </SettingsShell>,
    )

    expect(screen.getByRole('button', { name: 'about.title' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('button', { name: 'preferences.title' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('syncs the mounted panel into the shell store', () => {
    render(
      <SettingsShell panel="support">
        <p>Panel body</p>
      </SettingsShell>,
    )

    expect(setActiveSettingsPanelMock).toHaveBeenCalledWith('support')
  })
})
