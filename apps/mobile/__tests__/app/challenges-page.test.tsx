import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockChallengeListItem, createMockProfile } from '@orbit/shared/__tests__/factories'

const TestRenderer = require('react-test-renderer')

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

interface TestRoot {
  root: TestNode
}

const mocks = vi.hoisted(() => ({
  profile: null as ReturnType<typeof createMockProfile> | null,
  challengesData: [] as unknown,
  createMutate: vi.fn(),
  joinMutate: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useLocalSearchParams: () => ({}),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, isLoading: false }) }))
vi.mock('@/hooks/use-challenges', () => ({
  useChallenges: () => ({ data: mocks.challengesData }),
  useCreateChallenge: () => ({ mutateAsync: mocks.createMutate, isPending: false }),
  useJoinChallenge: () => ({ mutateAsync: mocks.joinMutate, isPending: false }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))
vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children?: unknown }) =>
    open ? React.createElement('View', null, children as never) : null,
}))
vi.mock('@/app/social/_components/social-opt-in-gate', () => ({
  SocialOptInGate: () => React.createElement('Text', null, 'social.optInGate.title'),
}))

vi.mock('@/app/social/challenges/_components/challenge-card', () => ({
  ChallengeCard: ({ challenge }: { challenge: { title: string } }) =>
    React.createElement('Text', null, challenge.title),
}))
vi.mock('@/app/social/challenges/_components/habit-picker', () => ({ HabitPicker: () => null }))
vi.mock('@/app/social/challenges/_components/invite-friends-picker', () => ({
  InviteFriendsPicker: () => null,
}))
vi.mock('@/components/ui/app-date-picker', () => ({
  AppDatePicker: (props: Record<string, unknown>) => React.createElement('AppDatePicker', props),
}))
vi.mock('@/components/ui/field-input', () => ({
  FieldInput: (props: Record<string, unknown>) => React.createElement('FieldInput', props),
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onPress }: { children?: unknown; onPress?: () => void }) =>
    React.createElement('PillButton', { onPress }, children as never),
}))

import ChallengesScreen from '@/app/social/challenges'
import { ChallengeList } from '@/app/social/challenges/_components/challenge-list'
import { CreateChallengeForm } from '@/app/social/challenges/_components/create-challenge-form'
import { JoinByCodeForm } from '@/app/social/challenges/_components/join-by-code-form'

function renderTree(element: React.ReactElement): TestRoot {
  let renderer: TestRoot | undefined
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element)
  })
  return renderer as TestRoot
}

function textContent(root: TestNode): string {
  return root
    .findAll(() => true)
    .map((node) => {
      const child = node.props?.children
      return typeof child === 'string' || typeof child === 'number' ? String(child) : ''
    })
    .join('\n')
}

function fieldLabels(root: TestNode): string[] {
  return root
    .findAll((node) => node.type === 'FieldInput')
    .map((node) => String(node.props.label ?? ''))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile = createMockProfile({ socialOptIn: true, handle: 'me' })
  mocks.challengesData = []
  mocks.createMutate.mockResolvedValue({ id: 'c-new' })
  mocks.joinMutate.mockResolvedValue(undefined)
})

describe('ChallengesScreen (mobile)', () => {
  it('renders the opt-in gate when social is disabled', () => {
    mocks.profile = createMockProfile({ socialOptIn: false, handle: 'me' })

    const tree = renderTree(<ChallengesScreen />)

    expect(textContent(tree.root)).toContain('social.optInGate.title')
    expect(textContent(tree.root)).not.toContain('challenges.actions.create')
  })

  it('renders create/join actions and the empty state when enabled', () => {
    const tree = renderTree(<ChallengesScreen />)

    const text = textContent(tree.root)
    expect(text).toContain('challenges.actions.create')
    expect(text).toContain('challenges.actions.join')
    expect(text).toContain('challenges.empty.create')
  })
})

describe('ChallengeList (mobile)', () => {
  it('partitions active and completed into sections', () => {
    const tree = renderTree(
      <ChallengeList
        challenges={[
          createMockChallengeListItem({ id: 'a', title: 'Active One', status: 'Active' }),
          createMockChallengeListItem({ id: 'b', title: 'Done One', status: 'Completed' }),
        ]}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onJoin={vi.fn()}
      />,
    )

    const text = textContent(tree.root)
    expect(text).toContain('challenges.sections.active')
    expect(text).toContain('challenges.sections.completed')
    expect(text).toContain('Active One')
    expect(text).toContain('Done One')
  })
})

describe('CreateChallengeForm (mobile)', () => {
  it('shows target + end date for CoopGoal and hides them for StreakTogether', () => {
    const tree = renderTree(<CreateChallengeForm onCreated={vi.fn()} />)

    expect(fieldLabels(tree.root)).toContain('challenges.create.targetLabel')
    expect(textContent(tree.root)).toContain('challenges.create.endDateLabel')

    const streakToggle = tree.root
      .findAll((node) => node.type === 'Pressable')
      .find((node) =>
        node.findAll((child) => child.type === 'Text').some((child) =>
          String(child.props.children ?? '').includes('challenges.type.streakTogether'),
        ),
      )

    TestRenderer.act(() => {
      ;(streakToggle?.props.onPress as () => void)()
    })

    expect(fieldLabels(tree.root)).not.toContain('challenges.create.targetLabel')
    expect(textContent(tree.root)).not.toContain('challenges.create.endDateLabel')
  })
})

describe('JoinByCodeForm (mobile)', () => {
  it('submits the entered code with no linked habits', async () => {
    const tree = renderTree(<JoinByCodeForm onJoined={vi.fn()} />)

    const codeField = tree.root
      .findAll((node) => node.type === 'FieldInput')
      .find((node) => node.props.label === 'challenges.join.codeLabel')!

    TestRenderer.act(() => {
      ;(codeField.props.onChangeText as (value: string) => void)('ABCD1234')
    })

    const submit = tree.root
      .findAll((node) => node.type === 'PillButton')
      .find((node) => String(node.props.children ?? '').includes('challenges.join.submit'))!

    await TestRenderer.act(async () => {
      await (submit.props.onPress as () => Promise<void>)()
    })

    expect(mocks.joinMutate).toHaveBeenCalledWith({ code: 'ABCD1234', linkedHabitIds: [] })
  })
})
