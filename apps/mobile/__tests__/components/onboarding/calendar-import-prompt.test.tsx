import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { useUIStore } from '@/stores/ui-store'

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

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, invalidate: vi.fn() }),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: vi.fn(() => Promise.resolve(undefined)),
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

async function renderPrompt() {
  let tree: { root: { findAllByType: (type: string) => unknown[] } } | null = null
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(React.createElement(CalendarImportPrompt))
    await Promise.resolve()
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
    hasImportedCalendar: false,
    ...overrides,
  }
}

beforeEach(() => {
  useUIStore.setState({ openOverlayIds: [], showCreateModal: false, showCreateGoalModal: false })
  mocks.profile = undefined
  mocks.pathname = '/'
})

describe('CalendarImportPrompt gating', () => {
  it('waits for the create modal to close', async () => {
    mocks.profile = baseProfile()
    useUIStore.getState().setShowCreateModal(true)
    const tree = await renderPrompt()
    expect(sheetCount(tree)).toBe(0)

    await TestRenderer.act(async () => {
      useUIStore.getState().setShowCreateModal(false)
      await Promise.resolve()
    })
    expect(sheetCount(tree)).toBe(1)
  })

  it('shows the sheet once onboarding and the tour are both complete', async () => {
    mocks.profile = baseProfile()
    expect(sheetCount(await renderPrompt())).toBe(1)
  })

  it('stays hidden while the tour is still running (hasCompletedTour false)', async () => {
    mocks.profile = baseProfile({ hasCompletedTour: false })
    expect(sheetCount(await renderPrompt())).toBe(0)
  })

  it('stays hidden before onboarding completes', async () => {
    mocks.profile = baseProfile({ hasCompletedOnboarding: false })
    expect(sheetCount(await renderPrompt())).toBe(0)
  })

  it('stays hidden once the calendar has been imported', async () => {
    mocks.profile = baseProfile({ hasImportedCalendar: true })
    expect(sheetCount(await renderPrompt())).toBe(0)
  })

  it('stays hidden on the calendar-sync route', async () => {
    mocks.profile = baseProfile()
    mocks.pathname = '/calendar-sync'
    expect(sheetCount(await renderPrompt())).toBe(0)
  })
})
