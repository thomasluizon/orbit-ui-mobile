import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AstraImportPrompt } from '@/components/onboarding/astra-import-prompt'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  profile: undefined as Record<string, unknown> | undefined,
  pathname: '/',
  conversationOpen: false,
  setConversationOpen: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('expo-router', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: vi.fn(async () => { await Promise.resolve(); return undefined; }), getItem: vi.fn(async () => { await Promise.resolve(); return null; }) },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, patchProfile: vi.fn() }),
}))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (
    selector: (store: { hasPendingAnswers: () => boolean }) => unknown,
  ) => selector({ hasPendingAnswers: () => false }),
}))

vi.mock('@/stores/ui-store', () => {
  const state = () => ({
    astraConversationOpen: mocks.conversationOpen,
    setAstraConversationOpen: mocks.setConversationOpen,
  })
  const useUIStore = (selector: (value: ReturnType<typeof state>) => unknown) => selector(state())
  useUIStore.getState = state
  return { useUIStore }
})

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: vi.fn(async () => { await Promise.resolve(); return undefined; }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement('PillButton', null, children),
}))

function renderPrompt() {
  let tree: any = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(AstraImportPrompt))
  })
  return tree!
}

function pressQuietAction(tree: any) {
  const rows = tree.root.findAll(
    (node: any) =>
      node.type === 'Pressable' &&
      node.findAll(
        (child: any) =>
          child.type === 'Text' && child.props.children === 'onboarding.wizard.importNotNow',
      ).length > 0,
  )
  const target = rows.at(-1)
  if (!target) throw new Error('Not now action not found')
  TestRenderer.act(() => {
    target.props.onPress()
  })
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
  mocks.conversationOpen = false
  mocks.setConversationOpen.mockClear()
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

  it('stays hidden while the conversation is open', () => {
    mocks.profile = baseProfile()
    mocks.conversationOpen = true
    expect(sheetCount(renderPrompt())).toBe(0)
  })
})

/**
 * Not now used to call `markSeen()` straight through, which flipped the gating
 * state and unmounted a presented TrueSheet. It has to wait for the dismissal.
 */
describe('AstraImportPrompt quiet dismissal', () => {
  beforeEach(() => {
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('keeps the sheet mounted until the dismissal completes, then marks it seen', () => {
    mocks.profile = baseProfile()
    const tree = renderPrompt()
    expect(sheetCount(tree)).toBe(1)

    pressQuietAction(tree)

    expect(sheetCount(tree)).toBe(1)
    expect(sheetTestControls.isDismissPending).toBe(true)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(sheetCount(tree)).toBe(0)
  })
})
