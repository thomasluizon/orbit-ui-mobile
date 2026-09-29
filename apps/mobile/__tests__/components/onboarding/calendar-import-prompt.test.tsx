import React from 'react'
import { StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { useUIStore } from '@/stores/ui-store'
import { sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const TestRenderer = require('react-test-renderer')
const renderedTrees: any[] = []

const mocks = vi.hoisted(() => ({
  profile: undefined as Record<string, unknown> | undefined,
  pathname: '/',
  push: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('expo-router', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
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
  PillButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement('PillButton', { onClick }, children),
}))

function renderPrompt() {
  let tree: any = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(CalendarImportPrompt))
  })
  renderedTrees.push(tree)
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
  vi.clearAllMocks()
  mocks.profile = undefined
  mocks.pathname = '/'
  useUIStore.setState({ openOverlayIds: [], showCreateModal: false })
})
afterEach(() => {
  TestRenderer.act(() => {
    for (const tree of renderedTrees.splice(0)) tree.unmount()
  })
})

describe('CalendarImportPrompt navigation', () => {
  beforeEach(() => {
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('opens calendar sync only after the sheet dismisses', () => {
    mocks.profile = baseProfile()
    const tree = renderPrompt()
    const importAction = tree.root.findAllByType('PillButton')[0]

    TestRenderer.act(() => {
      importAction.props.onClick()
    })

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(mocks.push).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mocks.push).toHaveBeenCalledWith('/calendar?import=1')
    expect(mocks.push).toHaveBeenCalledTimes(1)
  })
})

describe('CalendarImportPrompt gating', () => {
  it('waits until another sheet closes', async () => {
    mocks.profile = baseProfile()
    useUIStore.getState().registerOpenOverlay('already-open')
    const tree = renderPrompt()
    expect(sheetCount(tree)).toBe(0)

    await TestRenderer.act(async () => {
      useUIStore.getState().unregisterOpenOverlay('already-open')
      await Promise.resolve()
    })
    expect(sheetCount(tree)).toBe(1)
    await TestRenderer.act(async () => {
      tree.unmount()
      await Promise.resolve()
    })
  })
  it('shows the sheet once onboarding is complete', () => {
    mocks.profile = baseProfile()
    expect(sheetCount(renderPrompt())).toBe(1)
  })

  it('centres its copy and gives the quiet action a centred 44 point row that presses to 0.96', () => {
    mocks.profile = baseProfile()
    const tree = renderPrompt()
    const actions = tree.root.findAll((node: any) => node.type === 'SheetActions')[0]
    const quiet = actions.findAll((node: any) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function').at(-1)
    const quietStyle = (pressed: boolean) => StyleSheet.flatten(typeof quiet.props.style === 'function' ? quiet.props.style({ pressed }) : quiet.props.style)
    const label = actions.findAll((node: any) => node.type === 'Text' && node.props.children === 'common.later')[0]
    const description = tree.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'onboarding.wizard.calendarDescription')[0]

    expect(quietStyle(false)).toMatchObject({ minHeight: 44, alignItems: 'center', justifyContent: 'center' })
    expect(quietStyle(false).paddingBottom).toBeUndefined()
    expect(quietStyle(true).transform).toEqual([{ scale: 0.96 }])
    expect(StyleSheet.flatten(label.props.style).fontFamily).toBe('Geist_500Medium')
    expect(StyleSheet.flatten(description.props.style).textAlign).toBe('center')
  })

  it('pins Import and Later in the sheet footer, never in the scrolling body', () => {
    mocks.profile = baseProfile()
    const tree = renderPrompt()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['onboarding.wizard.calendarButton', 'common.later'])
    expect(sheetActionsUseActionPair(tree.root)).toBe(true)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual([])
  })

  it('does not wait for the retired tour state', () => {
    mocks.profile = baseProfile({ hasCompletedTour: false })
    expect(sheetCount(renderPrompt())).toBe(1)
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
    mocks.pathname = '/calendar'
    expect(sheetCount(renderPrompt())).toBe(0)
  })
})

/** Wait for TrueSheet dismissal before changing the state that unmounts it. */
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
