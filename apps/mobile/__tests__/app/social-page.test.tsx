import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SocialScreen from '@/app/social'

const mocks = vi.hoisted(() => ({
  tabParam: undefined as string | undefined,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ tab: mocks.tabParam }),
  useRouter: () => ({ setParams: vi.fn() }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { socialOptIn: true }, isLoading: false }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))
vi.mock('@/components/ui/scroll-to-top-button', () => ({ ScrollToTopButton: () => null }))
vi.mock('@/components/ui/section-head-tabs', () => {
  const ReactLib = require('react')
  return {
    SectionHeadTabs: (props: Record<string, unknown>) =>
      ReactLib.createElement('SectionHeadTabs', props),
  }
})
vi.mock('@/app/social/_components/social-opt-in-gate', () => ({ SocialOptInGate: () => null }))
vi.mock('@/app/social/_components/social-identity-bar', () => ({ SocialIdentityBar: () => null }))
vi.mock('@/app/social/_components/social-feed', () => {
  const ReactLib = require('react')
  return { SocialFeed: () => ReactLib.createElement('Text', null, 'feed-content') }
})
vi.mock('@/app/social/_components/social-friends', () => {
  const ReactLib = require('react')
  return { SocialFriends: () => ReactLib.createElement('Text', null, 'friends-content') }
})
vi.mock('@/app/social/_components/cheer-composer', () => ({ CheerComposer: () => null }))
vi.mock('@/app/social/_components/invite-confirm-sheet', () => ({ InviteConfirmSheet: () => null }))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
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

async function renderScreen(): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<SocialScreen />)
  })
  return tree
}

function tabList(tree: TestTree): TestNode {
  return tree.root.findAllByType('SectionHeadTabs')[0]!
}

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

beforeEach(() => {
  mocks.tabParam = undefined
})

describe('SocialScreen', () => {
  it('renders exactly the feed and friends tabs', async () => {
    const tree = await renderScreen()
    const renderedTabs = tabList(tree).props.tabs as { id: string; label: string }[]

    expect(renderedTabs).toHaveLength(2)
    expect(renderedTabs.map((tab) => tab.label)).toEqual([
      'social.tabs.feed',
      'social.tabs.friends',
    ])
    expect(tabList(tree).props.active).toBe('feed')
  })

  /**
   * Codex connector P2 on #698. This used to assert the fallback, which was the defect: a push
   * notification or inbox row queued before the deletion still carries `/social?tab=buddies`, and
   * the notification detail modals still offer View on it, so landing silently on the unrelated
   * Feed tab reads as a bug rather than as a retired feature. The retired destination now redirects
   * to the surviving relationship surface on purpose.
   */
  it('redirects a retired buddies deep link to the friends tab', async () => {
    mocks.tabParam = ['budd', 'ies'].join('')

    const tree = await renderScreen()

    expect(tabList(tree).props.tabs).toHaveLength(2)
    expect(tabList(tree).props.active).toBe('friends')
    expect(textContents(tree)).toEqual(expect.arrayContaining(['friends-content']))
  })

  it('still falls back to the feed for a tab deep link that never existed', async () => {
    mocks.tabParam = 'not-a-tab'

    const tree = await renderScreen()

    expect(tabList(tree).props.active).toBe('feed')
    expect(textContents(tree)).toEqual(expect.arrayContaining(['feed-content']))
  })

  it('opens the friends tab from a friends deep link', async () => {
    mocks.tabParam = 'friends'

    const tree = await renderScreen()

    expect(tabList(tree).props.active).toBe('friends')
    expect(textContents(tree)).toEqual(expect.arrayContaining(['friends-content']))
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['feed-content']))
  })
})
