import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PublicProfileSettings as PublicProfileSettingsData } from '@orbit/shared/types/public-profile'

const mutate = vi.fn()
const toastError = vi.fn()
const useProfileMock = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-public-profile-settings', () => ({
  usePublicProfileSettings: () => ({ mutate, isPending: false }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => useProfileMock(),
}))

vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }))

import { PublicProfileSettings } from '@/components/settings/public-profile-settings'

function setSettings(settings: PublicProfileSettingsData) {
  useProfileMock.mockReturnValue({ profile: { publicProfile: settings } })
}

const disabledSettings: PublicProfileSettingsData = {
  enabled: false,
  slug: null,
  shareUrl: null,
  showStreak: true,
  showLevel: true,
  showAchievements: true,
  showTopHabits: false,
}

const enabledSettings: PublicProfileSettingsData = {
  enabled: true,
  slug: 'ABCDEFGHJKLMNPQRSTUV12',
  shareUrl: 'https://app.useorbit.org/u/ABCDEFGHJKLMNPQRSTUV12',
  showStreak: true,
  showLevel: true,
  showAchievements: true,
  showTopHabits: false,
}

describe('PublicProfileSettings', () => {
  beforeEach(() => {
    mutate.mockClear()
    toastError.mockClear()
  })

  it('toggling enable calls the mutation with enabled flipped', () => {
    setSettings(disabledSettings)
    render(<PublicProfileSettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'profile.publicProfile.enable.title' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, regenerate: false }),
      expect.anything(),
    )
  })

  it('disables the four field switches when the profile is off', () => {
    setSettings(disabledSettings)
    render(<PublicProfileSettings />)

    const fieldSwitch = screen.getByRole('switch', { name: 'profile.publicProfile.fields.streak.title' })
    expect(fieldSwitch).toBeDisabled()
  })

  it('renders the share link and the field switches are enabled when on', () => {
    setSettings(enabledSettings)
    render(<PublicProfileSettings />)

    expect(screen.getByText(enabledSettings.shareUrl as string)).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'profile.publicProfile.fields.topHabits.title' }),
    ).not.toBeDisabled()
  })

  it('toggling a field switch submits that field flipped', () => {
    setSettings(enabledSettings)
    render(<PublicProfileSettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'profile.publicProfile.fields.topHabits.title' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, showTopHabits: true }),
      expect.anything(),
    )
  })

  it('copy writes the share url to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    setSettings(enabledSettings)
    render(<PublicProfileSettings />)

    fireEvent.click(screen.getByText('profile.publicProfile.link.copy'))

    expect(writeText).toHaveBeenCalledWith(enabledSettings.shareUrl)
  })
})
