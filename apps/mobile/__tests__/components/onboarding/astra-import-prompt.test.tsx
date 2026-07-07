import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AstraImportPrompt } from '@/components/onboarding/astra-import-prompt'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  profile: undefined as Record<string, unknown> | undefined,
  pathname: '/',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('expo-router', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: vi.fn(async () => undefined), getItem: vi.fn(async () => null) },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, patchProfile: vi.fn() }),
}))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (store: { hasPendingAnswers: () => boolean }) => unknown,
  ) => selector({ hasPendingAnswers: () => false }),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: vi.fn(async () => undefined),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('Sheet', null, children) : null,
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement('PillButton', null, children),
}))

function renderPrompt() {
  let tree: { root: { findAllByType: (type: string) => unknown[] } } | null = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(AstraImportPrompt))
  })
  return tree!
}

function sheetCount(tree: { root: { findAllByType: (type: string) => unknown[] } }): number {
  return tree.root.findAllByType('Sheet').length
}

function baseProfile(overrides: Record<string, unknown> = {}) {
  return {
    hasCompletedOnboarding: true,
    hasCompletedTour: true,
    hasImportedCalendar: true,
    hasSeenImportPrompt: false,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.profile = undefined
  mocks.pathname = '/'
})

describe('AstraImportPrompt gating', () => {
  it('shows the sheet once onboarding and the tour are both complete', () => {
    mocks.profile = baseProfile()
    expect(sheetCount(renderPrompt())).toBe(1)
  })

  it('stays hidden while the tour is still running (hasCompletedTour false)', () => {
    mocks.profile = baseProfile({ hasCompletedTour: false })
    expect(sheetCount(renderPrompt())).toBe(0)
  })

  it('stays hidden before onboarding completes', () => {
    mocks.profile = baseProfile({ hasCompletedOnboarding: false })
    expect(sheetCount(renderPrompt())).toBe(0)
  })

  it('stays hidden once the import prompt has been seen', () => {
    mocks.profile = baseProfile({ hasSeenImportPrompt: true })
    expect(sheetCount(renderPrompt())).toBe(0)
  })

  it('stays hidden on the chat route', () => {
    mocks.profile = baseProfile()
    mocks.pathname = '/chat'
    expect(sheetCount(renderPrompt())).toBe(0)
  })
})
