import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

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
    tree = TestRenderer.create(React.createElement(CalendarImportPrompt))
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
  mocks.profile = undefined
  mocks.pathname = '/'
})

describe('CalendarImportPrompt gating', () => {
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

  it('stays hidden once the calendar has been imported', () => {
    mocks.profile = baseProfile({ hasImportedCalendar: true })
    expect(sheetCount(renderPrompt())).toBe(0)
  })

  it('stays hidden on the calendar-sync route', () => {
    mocks.profile = baseProfile()
    mocks.pathname = '/calendar-sync'
    expect(sheetCount(renderPrompt())).toBe(0)
  })
})

/**
 * Later used to call `dismissPrompt()` straight through, which flipped the
 * gating state and unmounted a presented TrueSheet. It has to wait for the
 * dismissal.
 */
describe('CalendarImportPrompt quiet dismissal', () => {
  beforeEach(() => {
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('keeps the sheet mounted until the dismissal completes, then dismisses the prompt', () => {
    mocks.profile = baseProfile()
    const tree = renderPrompt()
    expect(sheetCount(tree)).toBe(1)

    const rows = tree.root.findAll(
      (node: any) =>
        node.type === 'Pressable' &&
        node.findAll(
          (child: any) => child.type === 'Text' && child.props.children === 'common.later',
        ).length > 0,
    )
    const later = rows.at(-1)
    if (!later) throw new Error('Later action not found')
    TestRenderer.act(() => {
      later.props.onPress()
    })

    expect(sheetCount(tree)).toBe(1)
    expect(sheetTestControls.isDismissPending).toBe(true)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(sheetCount(tree)).toBe(0)
  })
})
