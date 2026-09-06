import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationTabBar } from '@/components/navigation/destination-tab-bar'
import { press, renderNavigation } from '../ui/navigation-render'
const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: mocks.navigate }) }))

describe('DestinationTabBar', () => {
  it('keeps Today selected on the pushed inbox', () => {
    const tree = renderNavigation(<DestinationTabBar pathname="/notifications" />)
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    expect(tabs).toHaveLength(4)
    expect(tabs.find((node) => node.props.accessibilityState?.selected)?.props.accessibilityLabel).toBe('nav.today')
    tree.unmount()
  })
  beforeEach(() => { mocks.navigate.mockClear() })
  it('keeps all four translated destinations reachable through the router', () => {
    const tree = renderNavigation(<DestinationTabBar pathname="/calendar" />)
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    expect(tabs.map((node) => node.props.accessibilityLabel)).toEqual(['nav.today', 'nav.calendar', 'nav.progress', 'nav.profile'])
    expect(tabs.filter((node) => node.props.accessibilityState?.selected)).toEqual([tabs[1]])
    for (const tab of tabs) press(tab)
    expect(mocks.navigate.mock.calls).toEqual([['/'], ['/calendar'], ['/progress'], ['/profile']])
    tree.unmount()
  })
})
