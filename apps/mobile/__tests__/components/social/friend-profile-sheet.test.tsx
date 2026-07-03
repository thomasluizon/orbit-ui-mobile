import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { achievementEmoji, ApiClientError } from '@orbit/shared/utils'
import type { FriendProfileView } from '@orbit/shared/types/social'
import { FriendProfileSheet } from '@/app/social/_components/friend-profile-sheet'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en', exists: () => false },
  }),
}))

const mocks = vi.hoisted(() => ({
  profileReturn: {} as Record<string, unknown>,
  refetch: vi.fn(),
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriendProfile: () => mocks.profileReturn,
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findByType(type: unknown): TestNode
  findAllByType(type: unknown): TestNode[]
}

interface TestTree {
  root: TestNode
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

const profileView: FriendProfileView = {
  userId: 'user-1',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  currentStreak: 12,
  longestStreak: 40,
  level: 4,
  levelTitle: 'Navigator',
  totalXp: 820,
  friendsSinceUtc: '2026-05-01T00:00:00Z',
  weeklyActivity: [0, 1, 0, 2, 0, 3, 1],
  achievements: [],
  topHabits: [],
  isAccountabilityPartner: false,
  sharedChallenges: [],
}

function setProfileReturn(overrides: Record<string, unknown>) {
  mocks.profileReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
    ...overrides,
  }
}

async function renderSheet() {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <FriendProfileSheet userId="user-1" displayName="Ada Lovelace" open onClose={() => {}} />,
    )
  })
  return tree
}

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

function actionButtons(tree: TestTree): TestNode[] {
  return tree.root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
  )
}

describe('FriendProfileSheet', () => {
  beforeEach(() => {
    mocks.refetch.mockClear()
  })

  it('labels the loading indicator for TalkBack', async () => {
    setProfileReturn({ isLoading: true })
    const tree = await renderSheet()
    expect(tree.root.findByType('ActivityIndicator').props.accessibilityLabel).toBe(
      'common.loading',
    )
  })

  it('shows the permanent unavailable copy without a retry action on 404', async () => {
    setProfileReturn({ isError: true, error: new ApiClientError(404, 'not found') })
    const tree = await renderSheet()
    expect(textContents(tree)).toEqual(
      expect.arrayContaining(['social.friendProfile.unavailable']),
    )
    expect(actionButtons(tree)).toHaveLength(0)
  })

  it('offers a retry that refetches on transient failures', async () => {
    setProfileReturn({ isError: true, error: new ApiClientError(500, 'server down') })
    const tree = await renderSheet()
    expect(textContents(tree)).toEqual(
      expect.arrayContaining(['social.friendProfile.loadError']),
    )
    const [button] = actionButtons(tree)
    expect(button).toBeDefined()
    ;(button!.props as { onPress: () => void }).onPress()
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the enriched stat tiles and the empty achievements line', async () => {
    setProfileReturn({ data: profileView })
    const tree = await renderSheet()
    expect(textContents(tree)).toEqual(
      expect.arrayContaining([
        12,
        40,
        820,
        4,
        'Navigator',
        'social.friendProfile.noAchievements',
      ]),
    )
  })

  it('renders top habits with their completion counts', async () => {
    setProfileReturn({
      data: {
        ...profileView,
        topHabits: [{ title: 'Reading', emoji: '📖', completionCount: 40 }],
      },
    })
    const tree = await renderSheet()
    expect(textContents(tree)).toEqual(expect.arrayContaining(['Reading', '🔥 40']))
  })

  it('renders shared context when the friend is a partner and shares challenges', async () => {
    setProfileReturn({
      data: {
        ...profileView,
        isAccountabilityPartner: true,
        sharedChallenges: [{ id: 'c-1', title: 'Sunrise Sprint' }],
      },
    })
    const tree = await renderSheet()
    expect(textContents(tree)).toEqual(
      expect.arrayContaining(['social.friendProfile.accountabilityPartner', 'Sunrise Sprint']),
    )
  })

  it('omits the shared context section when there is nothing to show', async () => {
    setProfileReturn({ data: profileView })
    const tree = await renderSheet()
    expect(textContents(tree)).not.toEqual(
      expect.arrayContaining(['social.friendProfile.accountabilityPartner']),
    )
  })

  it('prefixes achievement chips with the shared achievement glyph', async () => {
    setProfileReturn({
      data: {
        ...profileView,
        achievements: [{ name: 'First Steps', iconKey: 'first_habit', rarity: 'Common' }],
      },
    })
    const tree = await renderSheet()
    expect(textContents(tree)).toEqual(
      expect.arrayContaining([`${achievementEmoji('first_habit')} First Steps`]),
    )
  })
})
