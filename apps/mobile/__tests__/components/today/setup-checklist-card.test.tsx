import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

import { SetupChecklistCard } from '@/components/today/setup-checklist-card'

const TestRenderer = require('react-test-renderer')

type MockUiState = {
  setupChecklistDismissed: boolean
  setSetupChecklistDismissed: (dismissed: boolean) => void
}

let mockProfile: Profile | undefined
const setDismissed = vi.fn()
const uiState: MockUiState = {
  setupChecklistDismissed: false,
  setSetupChecklistDismissed: setDismissed,
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => ({
      bgCard: 'rgba(255,255,255,0.04)',
      hairline: 'rgba(255,255,255,0.1)',
      hairlineStrong: 'rgba(255,255,255,0.18)',
      primary: '#7f46f7',
      fgOnPrimary: '#ffffff',
      fg1: '#f8fafc',
      fg3: '#90a1b9',
      fg4: '#62748e',
    }),
  }
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: MockUiState) => unknown) => selector(uiState),
}))

function renderCard() {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<SetupChecklistCard />)
  })
  return tree
}

function textValues(tree: ReturnType<typeof TestRenderer.create>): unknown[] {
  return tree.root
    .findAllByType('Text')
    .map((node: { props: { children: unknown } }) => node.props.children)
}

function findDismissButton(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll(
    (node: { props?: Record<string, unknown>; type: unknown }) =>
      Boolean(node.props) &&
      node.props?.accessibilityRole === 'button' &&
      typeof node.props?.onPress === 'function' &&
      typeof node.type !== 'string',
  )[0]
}

describe('SetupChecklistCard (mobile)', () => {
  beforeEach(() => {
    mockProfile = createMockProfile({
      hasCreatedFirstHabit: false,
      hasLoggedFirstHabit: false,
      hasTriedAstra: false,
      hasCompletedOnboardingChecklist: false,
    })
    setDismissed.mockClear()
  })

  it('renders all items pending while the profile is loading', () => {
    mockProfile = undefined
    const texts = textValues(renderCard())
    expect(texts).toContain('today.setupChecklist.progress({"done":0,"total":3})')
  })

  it('renders even once the checklist is completed server-side, visibility is owned by the engagement slot', () => {
    mockProfile = createMockProfile({ hasCompletedOnboardingChecklist: true })
    expect(renderCard().toJSON()).not.toBeNull()
  })

  it('renders the three items and progress from the flags', () => {
    mockProfile = createMockProfile({
      hasCreatedFirstHabit: true,
      hasLoggedFirstHabit: false,
      hasTriedAstra: false,
      hasCompletedOnboardingChecklist: false,
    })
    const texts = textValues(renderCard())
    expect(texts).toEqual(
      expect.arrayContaining([
        'today.setupChecklist.items.createHabit',
        'today.setupChecklist.items.logHabit',
        'today.setupChecklist.items.tryAstra',
        'today.setupChecklist.progress({"done":1,"total":3})',
      ]),
    )
  })

  it('shows the completion message when all signals are done', () => {
    mockProfile = createMockProfile({
      hasCreatedFirstHabit: true,
      hasLoggedFirstHabit: true,
      hasTriedAstra: true,
    })
    const texts = textValues(renderCard())
    expect(texts).toContain('today.setupChecklist.complete')
  })

  it('persists dismissal when the close button is pressed', () => {
    const tree = renderCard()
    const button = findDismissButton(tree)
    expect(button).toBeTruthy()
    TestRenderer.act(() => {
      button?.props.onPress?.()
    })
    expect(setDismissed).toHaveBeenCalledWith(true)
  })
})
