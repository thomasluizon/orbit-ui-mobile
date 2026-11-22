import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { formatAPIDateInTimeZone } from '@orbit/shared/utils'
import { TodayOrbit } from '@/components/today/today-orbit'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => {
  const profile: { id: string; timeZone: string; hasProAccess: boolean; aiMessagesUsed: number; aiMessagesLimit: number; lastCompletionDate?: string } = { id: 'profile', timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 }
  return { online: true, proactive: true, profile }
})

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }) }))
vi.mock('@/hooks/use-proactive-item', () => ({ useProactiveItem: () => ({ item: mocks.proactive ? createMockProactiveItem({ text: 'Check in' }) : null, openItem: vi.fn() }) }))
vi.mock('@/components/ui/orbit-mascot', () => ({ OrbitMascot: (props: Record<string, unknown>) => React.createElement('OrbitMascotProbe', props) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Tree = import('react-test-renderer').ReactTestRenderer

const DAY = 86_400_000
const beyondTheWindow = () => formatAPIDateInTimeZone(new Date(Date.now() - 40 * DAY), 'UTC')

async function renderLine(): Promise<Tree> {
  let tree!: Tree
  await renderer.act(async () => {
    tree = renderer.create(<TodayOrbit today={formatAPIDateInTimeZone(new Date(), 'UTC')} isTodaySelected suppressed={false} />)
    await Promise.resolve()
  })
  return tree
}
const probe = (tree: Tree) => tree.root.findAll(node => (node.type as unknown) === 'OrbitMascotProbe')[0]!.props as { size: number; state?: string; still?: boolean; live?: string }
const row = (tree: Tree) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'today-orbit-slot')[0]!

describe('Android Orbit line on Hoje', () => {
  beforeEach(() => {
    mocks.online = true
    mocks.proactive = true
    mocks.profile = { id: 'profile', timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 }
    useUIStore.setState({ orbitConversationOpen: false })
  })

  it('draws the live Orbit at 48 and names the row by the sentence', async () => {
    enableTestFlags('orbit_guided_flows')
    const tree = await renderLine()
    expect(probe(tree)).toMatchObject({ size: 48, state: 'parado', live: 'withLead' })
    expect(probe(tree).still).toBeUndefined()
    expect(row(tree).props.accessibilityLabel).toBe('Check in')
    expect(row(tree).props.accessibilityHint).toBe('todayOrbit.openConversation')
  })

  it('shows Descansando and a first person reason offline, and the press opens the conversation', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.online = false
    const tree = await renderLine()
    expect(probe(tree).state).toBe('descansando')
    expect(row(tree).props.accessibilityLabel).toBe('todayOrbit.guided.offline')
    await renderer.act(() => { (row(tree).props.onPress as () => void)() })
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
  })

  it('shows Descansando at the message limit', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.profile = { ...mocks.profile, aiMessagesUsed: 5 }
    const tree = await renderLine()
    expect(probe(tree).state).toBe('descansando')
    expect(row(tree).props.accessibilityLabel).toBe('conversation.restLimit')
  })

  it('shows the sentence with no count of days for a gap beyond the window, as a link to Progresso', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.proactive = false
    mocks.profile = { ...mocks.profile, lastCompletionDate: beyondTheWindow() }
    const tree = await renderLine()
    expect(row(tree).props.accessibilityLabel).toBe('todayOrbit.guided.returning')
    expect(row(tree).props.accessibilityRole).toBe('link')
    expect(row(tree).props.accessibilityHint).toBe('todayOrbit.viewProgress')
  })

  it('keeps the bounded sentence for a gap beyond the window while the flag is off', async () => {
    mocks.proactive = false
    mocks.profile = { ...mocks.profile, lastCompletionDate: beyondTheWindow() }
    const tree = await renderLine()
    expect(row(tree).props.accessibilityLabel).toBe('todayOrbit.returningBounded')
  })

  it('draws the Orbit at 48 that runs with the conversation entry, with no state, while the flag is off', async () => {
    mocks.online = false
    const tree = await renderLine()
    expect(probe(tree)).toMatchObject({ size: 48, live: 'withLead' })
    expect(probe(tree).still).toBeUndefined()
    expect(probe(tree).state).toBeUndefined()
    expect(row(tree).props.accessibilityLabel).toBe('Check in')
  })
})
