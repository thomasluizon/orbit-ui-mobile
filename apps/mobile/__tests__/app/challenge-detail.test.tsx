import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockChallengeDetail } from '@orbit/shared/__tests__/factories'

const TestRenderer = require('react-test-renderer')

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  find: (predicate: (node: TestNode) => boolean) => TestNode
}

interface TestRoot {
  root: TestNode
}

const mocks = vi.hoisted(() => ({
  detailReturn: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  leaveMutate: vi.fn(),
  setHabitsMutate: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/hooks/use-challenges', () => ({
  useChallengeDetail: () => mocks.detailReturn,
  useLeaveChallenge: () => ({ mutateAsync: mocks.leaveMutate, isPending: false }),
  useSetChallengeHabits: () => ({ mutateAsync: mocks.setHabitsMutate, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

vi.mock('@/components/ui/icons', () => ({
  Target: () => null,
  Flame: () => null,
  Pencil: () => null,
}))

vi.mock('@/components/ui/progress-bar', () => ({
  ProgressBar: (props: Record<string, unknown>) => React.createElement('ProgressBar', props),
}))
vi.mock('@/components/ui/user-avatar', () => ({ UserAvatar: () => null }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onPress }: { children?: unknown; onPress?: () => void }) =>
    React.createElement('PillButton', { onPress }, children as never),
}))
vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children?: unknown }) =>
    open ? React.createElement('View', null, children as never) : null,
}))
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm?: () => void }) =>
    open ? React.createElement('ConfirmButton', { onPress: onConfirm }) : null,
}))
vi.mock('@/app/social/challenges/_components/share-join-code', () => ({ ShareJoinCode: () => null }))
vi.mock('@/app/social/challenges/_components/habit-picker', () => ({
  HabitPicker: ({ onToggle }: { onToggle: (id: string) => void }) =>
    React.createElement('Pressable', { testID: 'habit-h-1', onPress: () => onToggle('h-1') }),
}))

import { ChallengeDetail } from '@/app/social/challenges/_components/challenge-detail'

function renderTree(element: React.ReactElement): TestRoot {
  let renderer: TestRoot | undefined
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element)
  })
  return renderer as TestRoot
}

function collectStrings(value: unknown, acc: string[]): void {
  if (typeof value === 'string' || typeof value === 'number') {
    acc.push(String(value))
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, acc))
  }
}

function textContent(root: TestNode): string {
  const acc: string[] = []
  root.findAll(() => true).forEach((node) => collectStrings(node.props.children, acc))
  return acc.join('')
}

function pillWith(root: TestNode, text: string): TestNode | undefined {
  return root
    .findAll((node) => node.type === 'PillButton')
    .find((node) => String(node.props.children ?? '').includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.detailReturn.isLoading = false
  mocks.detailReturn.isError = false
  mocks.leaveMutate.mockResolvedValue(undefined)
  mocks.setHabitsMutate.mockResolvedValue(undefined)
})

describe('ChallengeDetail (mobile)', () => {
  it('renders CoopGoal shared progress bound to currentProgress/targetCount', () => {
    mocks.detailReturn.data = createMockChallengeDetail({
      type: 'CoopGoal',
      currentProgress: 12,
      targetCount: 30,
    })

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={vi.fn()} />)

    expect(textContent(tree.root)).toContain('12 / 30')
    const bar = tree.root.findAll((node) => node.type === 'ProgressBar')[0]
    expect(bar?.props.progress).toBeCloseTo(0.4)
  })

  it('renders a StreakTogether counter and no progress bar', () => {
    mocks.detailReturn.data = createMockChallengeDetail({
      type: 'StreakTogether',
      currentProgress: 5,
      targetCount: null,
      periodEndUtc: null,
      yourLinkedHabitIds: ['h-1'],
    })

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={vi.fn()} />)

    const streak = tree.root.find(
      (node) => node.type === 'Text' && node.props.testID === 'challenge-streak-count',
    )
    expect(String(streak.props.children)).toBe('5')
    expect(tree.root.findAll((node) => node.type === 'ProgressBar')).toHaveLength(0)
  })

  it('lists members by name with no per-person numbers', () => {
    mocks.detailReturn.data = createMockChallengeDetail({
      participants: [
        { userId: 'u1', name: 'Ada', joinedAtUtc: '2026-03-01T00:00:00Z' },
        { userId: 'u2', name: 'Grace', joinedAtUtc: '2026-03-02T00:00:00Z' },
      ],
    })

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={vi.fn()} />)

    const members = tree.root.find(
      (node) => node.props.testID === 'challenge-members',
    )
    const memberText = textContent(members)
    expect(memberText).toContain('Ada')
    expect(memberText).toContain('Grace')
    expect(memberText).not.toMatch(/[0-9]/)
  })

  it('shows the link-habits CTA when none are linked and saves the selection', async () => {
    mocks.detailReturn.data = createMockChallengeDetail({ yourLinkedHabitIds: [] })

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={vi.fn()} />)

    TestRenderer.act(() => {
      ;(pillWith(tree.root, 'challenges.detail.linkHabitsCta')?.props.onPress as () => void)()
    })

    TestRenderer.act(() => {
      ;(
        tree.root.find((node) => node.props.testID === 'habit-h-1').props.onPress as () => void
      )()
    })

    await TestRenderer.act(async () => {
      await (pillWith(tree.root, 'common.save')?.props.onPress as () => Promise<void>)()
    })

    expect(mocks.setHabitsMutate).toHaveBeenCalledWith({ challengeId: 'c-1', habitIds: ['h-1'] })
  })

  it('shows a retryable error state instead of not-found when the query fails', () => {
    mocks.detailReturn.data = undefined
    mocks.detailReturn.isError = true

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={vi.fn()} />)

    const text = textContent(tree.root)
    expect(text).toContain('challenges.errors.loadFailed')
    expect(text).not.toContain('challenges.detail.notFound')

    TestRenderer.act(() => {
      ;(pillWith(tree.root, 'common.retry')?.props.onPress as () => void)()
    })

    expect(mocks.detailReturn.refetch).toHaveBeenCalled()
  })

  it('exposes an accessible edit affordance when habits are linked', () => {
    mocks.detailReturn.data = createMockChallengeDetail({ yourLinkedHabitIds: ['h-1'] })

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={vi.fn()} />)

    const editButton = tree.root
      .findAll((node) => node.type === 'Pressable')
      .find((node) => node.props.accessibilityLabel === 'challenges.detail.editHabits')
    expect(editButton).toBeTruthy()
    expect(pillWith(tree.root, 'challenges.detail.linkHabitsCta')).toBeUndefined()
  })

  it('leaves the challenge after confirmation', async () => {
    mocks.detailReturn.data = createMockChallengeDetail({ yourLinkedHabitIds: ['h-1'] })
    const onLeft = vi.fn()

    const tree = renderTree(<ChallengeDetail challengeId="c-1" onLeft={onLeft} />)

    TestRenderer.act(() => {
      ;(pillWith(tree.root, 'challenges.detail.leave')?.props.onPress as () => void)()
    })

    await TestRenderer.act(async () => {
      await (
        tree.root.find((node) => node.type === 'ConfirmButton').props.onPress as () => Promise<void>
      )()
    })

    expect(mocks.leaveMutate).toHaveBeenCalledWith('c-1')
  })
})
