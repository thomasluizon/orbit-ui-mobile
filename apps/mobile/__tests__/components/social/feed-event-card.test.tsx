import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FriendFeedItem } from '@orbit/shared/types/social'
import { FeedEventCard } from '@/app/social/_components/feed-event-card'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en', exists: () => false },
  }),
}))

vi.mock('@/app/social/_components/friend-profile-sheet', () => ({
  FriendProfileSheet: ({ open, userId }: { open: boolean; userId: string | null }) => {
    if (!open) return null
    const react = require('react')
    return react.createElement('Text', null, `profile:${userId}`)
  },
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  find(predicate: (node: TestNode) => boolean): TestNode
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
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

const item: FriendFeedItem = {
  id: 'feed-1',
  actorUserId: 'user-9',
  actorHandle: 'grace',
  actorDisplayName: 'Grace',
  type: 'StreakMilestone',
  value: 7,
  achievementId: null,
  createdAtUtc: '2026-05-01T00:00:00Z',
}

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

function pressables(tree: TestTree): TestNode[] {
  return tree.root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
  )
}

async function renderCard(onCheer: (target: unknown) => void) {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<FeedEventCard item={item} onCheer={onCheer} />)
  })
  return tree
}

describe('FeedEventCard', () => {
  it('opens the actor profile from the identity press target', async () => {
    const tree = await renderCard(vi.fn())
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['profile:user-9']))

    const identity = tree.root.find(
      (node) =>
        node.type === 'Pressable' &&
        node.props.accessibilityLabel === 'social.feed.viewProfile:{"name":"Grace"}',
    )
    await TestRenderer.act(async () => {
      ;(identity.props as { onPress: () => void }).onPress()
    })

    expect(textContents(tree)).toEqual(expect.arrayContaining(['profile:user-9']))
  })

  it('keeps Cheer a separate action that does not open the profile', async () => {
    const onCheer = vi.fn()
    const tree = await renderCard(onCheer)

    const cheer = pressables(tree).find((node) => node.props.accessibilityLabel === undefined)
    expect(cheer).toBeDefined()
    await TestRenderer.act(async () => {
      ;(cheer!.props as { onPress: () => void }).onPress()
    })

    expect(onCheer).toHaveBeenCalledWith({ recipientId: 'user-9', displayName: 'Grace' })
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['profile:user-9']))
  })
})
