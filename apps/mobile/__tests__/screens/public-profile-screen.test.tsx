import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { PublicProfileSettings } from '@orbit/shared/types/public-profile'

const TestRenderer = require('react-test-renderer')

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  find: (predicate: (node: TestNode) => boolean) => TestNode
}

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  setString: vi.fn(),
  share: vi.fn(async () => {}),
  showError: vi.fn(),
  profile: null as ReturnType<typeof createMockProfile> | null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
}))

vi.mock('@/hooks/use-public-profile-settings', () => ({
  usePublicProfileSettings: () => ({ mutate: mocks.mutate, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

vi.mock('@react-native-clipboard/clipboard', () => ({
  default: { setString: mocks.setString },
}))

const tokensV2Proxy: unknown = new Proxy({}, { get: () => '#111111' })

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => tokensV2Proxy }
})

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))

vi.mock('@/components/ui/section-label', () => ({
  SectionLabel: ({ children }: { children?: unknown }) =>
    React.createElement('SectionLabel', null, children as never),
}))

vi.mock('@/components/ui/settings-row', () => ({
  SettingsRow: ({ children }: { children?: unknown }) =>
    React.createElement('SettingsRow', null, children as never),
  Switch: (props: Record<string, unknown>) => React.createElement('Switch', props),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: (props: Record<string, unknown>) => React.createElement('PillButton', props),
}))

vi.mock('lucide-react-native', () => {
  const make = (name: string) => (props: Record<string, unknown>) => React.createElement(name, props)
  return { Check: make('Check'), Copy: make('Copy'), RefreshCw: make('RefreshCw'), Share2: make('Share2') }
})

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return { ...actual, Share: { share: mocks.share }, Alert: { alert: vi.fn() } }
})

import PublicProfileScreen from '@/app/public-profile'

const enabledSettings: PublicProfileSettings = {
  enabled: true,
  slug: 'ABCDEFGHJKLMNPQRSTUV12',
  shareUrl: 'https://app.useorbit.org/u/ABCDEFGHJKLMNPQRSTUV12',
  showStreak: true,
  showLevel: true,
  showAchievements: true,
  showTopHabits: false,
}

const disabledSettings: PublicProfileSettings = {
  enabled: false,
  slug: null,
  shareUrl: null,
  showStreak: true,
  showLevel: true,
  showAchievements: true,
  showTopHabits: false,
}

function renderScreen() {
  let tree: { root: TestNode } | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(<PublicProfileScreen />)
  })
  return tree as { root: TestNode }
}

function switchByLabel(root: TestNode, label: string): TestNode | undefined {
  return root.findAll((n) => n.type === 'Switch' && n.props.accessibilityLabel === label)[0]
}

describe('PublicProfileScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile = createMockProfile({ publicProfile: enabledSettings })
  })

  it('toggling enable submits the flipped enabled flag', () => {
    mocks.profile = createMockProfile({ publicProfile: disabledSettings })
    const tree = renderScreen()

    const enableSwitch = switchByLabel(tree.root, 'profile.publicProfile.enable.title')
    TestRenderer.act(() => {
      ;(enableSwitch?.props.onToggle as () => void)()
    })

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, regenerate: false }),
      expect.anything(),
    )
  })

  it('disables the field switches when the profile is off', () => {
    mocks.profile = createMockProfile({ publicProfile: disabledSettings })
    const tree = renderScreen()

    const streakSwitch = switchByLabel(tree.root, 'profile.publicProfile.fields.streak.title')
    expect(streakSwitch?.props.disabled).toBe(true)
  })

  it('copy writes the backend share url to the clipboard', () => {
    const tree = renderScreen()

    const copyButton = tree.root.find(
      (n) =>
        n.props.accessibilityLabel === 'profile.publicProfile.link.copy' &&
        typeof n.props.onPress === 'function',
    )
    TestRenderer.act(() => {
      ;(copyButton.props.onPress as () => void)()
    })

    expect(mocks.setString).toHaveBeenCalledWith(enabledSettings.shareUrl)
  })

  it('share opens the OS sheet with the backend share url', async () => {
    const tree = renderScreen()

    const pill = tree.root.find((n) => n.type === 'PillButton')
    await TestRenderer.act(async () => {
      await (pill.props.onPress as () => Promise<void>)()
    })

    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({ message: enabledSettings.shareUrl }),
    )
  })
})
