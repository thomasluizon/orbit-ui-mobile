import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import { TodayAstra } from '@/components/today/today-astra'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  online: true,
  profile: { id: 'profile', timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }) }))
vi.mock('@/hooks/use-proactive-item', () => ({ useProactiveItem: () => ({ item: createMockProactiveItem({ text: 'Check in' }), openItem: vi.fn() }) }))
vi.mock('@/components/ui/orbit-mascot', () => ({ OrbitMascot: (props: Record<string, unknown>) => React.createElement('OrbitMascotProbe', props) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer

async function renderLine(): Promise<Tree> {
  let tree!: Tree
  await renderer.act(async () => {
    tree = renderer.create(<TodayAstra today={formatAPIDateInTimeZone(new Date(), 'UTC')} isTodaySelected suppressed={false} />)
    await Promise.resolve()
  })
  return tree
}
const probe = (tree: Tree) => tree.root.findAll(node => (node.type as unknown) === 'OrbitMascotProbe')[0]!.props as { size: number; state?: string; still?: boolean }
const row = (tree: Tree) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'today-astra-slot')[0]!

describe('Android Orbit line on Hoje', () => {
  beforeEach(() => {
    mocks.online = true
    mocks.profile = { id: 'profile', timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 }
    useUIStore.setState({ astraConversationOpen: false })
  })

  it('draws Orbit still at 48 and names the row by the sentence', async () => {
    enableTestFlags('orbit_guided_flows')
    const tree = await renderLine()
    expect(probe(tree)).toMatchObject({ size: 48, still: true, state: 'parado' })
    expect(row(tree).props.accessibilityLabel).toBe('Check in')
    expect(row(tree).props.accessibilityHint).toBe('todayAstra.openConversation')
  })

  it('shows Descansando and a first person reason offline, and the press opens the conversation', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.online = false
    const tree = await renderLine()
    expect(probe(tree).state).toBe('descansando')
    expect(row(tree).props.accessibilityLabel).toBe('todayAstra.offline')
    await renderer.act(() => { (row(tree).props.onPress as () => void)() })
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('shows Descansando at the message limit', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.profile = { ...mocks.profile, aiMessagesUsed: 5 }
    const tree = await renderLine()
    expect(probe(tree).state).toBe('descansando')
    expect(row(tree).props.accessibilityLabel).toBe('todayAstra.limit')
  })

  it('keeps the 20 px glyph while the flag is off', async () => {
    mocks.online = false
    const tree = await renderLine()
    expect(probe(tree).size).toBe(20)
    expect(row(tree).props.accessibilityLabel).toBe('Check in')
  })
})
