import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AstraImportPrompt } from '@/components/onboarding/astra-import-prompt'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { useUIStore } from '@/stores/ui-store'
import { sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const TestRenderer = require('react-test-renderer')
const renderedTrees: any[] = []

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

async function renderPrompt() {
  let tree: any = null
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(React.createElement(AstraImportPrompt))
    await Promise.resolve()
  })
  renderedTrees.push(tree)
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
  useUIStore.setState({ astraConversationOpen: false, openOverlayIds: [], showCreateModal: false })
})
afterEach(async () => {
  await TestRenderer.act(async () => {
    for (const tree of renderedTrees.splice(0)) tree.unmount()
    await Promise.resolve()
  })
})

describe('AstraImportPrompt gating', () => {
  it('waits while another sheet is open', async () => {
    mocks.profile = baseProfile()
    useUIStore.getState().registerOpenOverlay('already-open')
    const tree = await renderPrompt()
    expect(sheetCount(tree)).toBe(0)

    await TestRenderer.act(async () => {
      useUIStore.getState().unregisterOpenOverlay('already-open')
      await Promise.resolve()
    })
    expect(sheetCount(tree)).toBe(1)
    await TestRenderer.act(() => tree.unmount())
  })
  it('shows the sheet once onboarding is complete', async () => {
    mocks.profile = baseProfile()
    expect(sheetCount(await renderPrompt())).toBe(1)
  })

  it('pins Import and Not now in the sheet footer, never in the scrolling body', async () => {
    mocks.profile = baseProfile()
    const tree = await renderPrompt()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['onboarding.wizard.importButton', 'onboarding.wizard.importNotNow'])
    expect(sheetActionsUseActionPair(tree.root)).toBe(true)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual([])
  })

  it('does not wait for the retired tour state', async () => {
    mocks.profile = baseProfile({ hasCompletedTour: false })
    expect(sheetCount(await renderPrompt())).toBe(1)
  })

  it('stays hidden before onboarding completes', async () => {
    mocks.profile = baseProfile({ hasCompletedOnboarding: false })
    expect(sheetCount(await renderPrompt())).toBe(0)
  })

  it('stays hidden once the import prompt has been seen', async () => {
    mocks.profile = baseProfile({ hasSeenImportPrompt: true })
    expect(sheetCount(await renderPrompt())).toBe(0)
  })

  it('stays hidden while the conversation is open', async () => {
    mocks.profile = baseProfile()
    useUIStore.getState().setAstraConversationOpen(true)
    expect(sheetCount(await renderPrompt())).toBe(0)
  })
})

/** Wait for TrueSheet dismissal before changing the state that unmounts it. */
describe('AstraImportPrompt quiet dismissal', () => {
  beforeEach(() => {
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('keeps the sheet mounted until the dismissal completes, then marks it seen', async () => {
    mocks.profile = baseProfile()
    const tree = await renderPrompt()
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
