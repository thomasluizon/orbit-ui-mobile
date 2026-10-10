import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationTabBar } from '@/components/navigation/destination-tab-bar'
import { useUIStore } from '@/stores/ui-store'
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
  it.each(['/nao-existe', '/calendar/bad'])('leaves every destination unselected on the not-found screen at %s', (pathname) => {
    const tree = renderNavigation(<DestinationTabBar pathname={pathname} notFound />)
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    expect(tabs).toHaveLength(4)
    expect(tabs.every((tab) => tab.props.accessibilityState?.selected === false)).toBe(true)
    tree.unmount()
  })
  beforeEach(() => { mocks.navigate.mockClear() })
  it('keeps all four translated destinations reachable through the router', () => {
    const tree = renderNavigation(<DestinationTabBar pathname="/calendar" />)
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    expect(tabs.map((node) => node.props.accessibilityLabel)).toEqual(['nav.today', 'nav.calendar', 'nav.progress', 'nav.profile'])
    expect(tabs.filter((node) => node.props.accessibilityState?.selected)).toEqual([tabs[1]])
    for (const tab of tabs.filter((tab) => !tab.props.accessibilityState?.selected)) press(tab)
    expect(mocks.navigate.mock.calls).toEqual([['/(tabs)'], ['/progress'], ['/profile']])
    tree.unmount()
  })

  it('keeps the previous destination on Search and defaults to Today', () => {
    useUIStore.getState().setLastDestination('calendario')
    const fromCalendar = renderNavigation(<DestinationTabBar pathname="/search" />)
    const calendar = fromCalendar.hosts().find((node) => node.props.accessibilityLabel === 'nav.calendar')
    expect(calendar?.props.accessibilityState?.selected).toBe(true)
    fromCalendar.unmount()
    useUIStore.getState().setLastDestination('hoje')
    const direct = renderNavigation(<DestinationTabBar pathname="/search" />)
    const today = direct.hosts().find((node) => node.props.accessibilityLabel === 'nav.today')
    expect(today?.props.accessibilityState?.selected).toBe(true)
    direct.unmount()
  })
})

it.each([
  ['/', 'HomeFilled'], ['/calendar', 'CalendarDaysFilled'],
  ['/progress', 'LayoutDashboardFilled'], ['/profile', 'UserFilled'],
])('renders the filled destination glyph on %s', (pathname, filledIcon) => {
  const tree = renderNavigation(<DestinationTabBar pathname={pathname} />)
  const icons = tree.hosts().filter((node) => ['Home', 'HomeFilled', 'CalendarDays', 'CalendarDaysFilled', 'LayoutDashboard', 'LayoutDashboardFilled', 'User', 'UserFilled', 'ChartLine'].includes(String(node.type)))
  expect(icons).toHaveLength(4)
  expect(icons.filter((node) => String(node.type).endsWith('Filled')).map((node) => node.type)).toEqual([filledIcon])
  expect(icons.some((node) => node.type === 'ChartLine')).toBe(false)
  tree.unmount()
})

it.each(['/', '/calendar', '/progress', '/profile'])('reselects the active root without navigation at %s', (pathname) => {
  mocks.navigate.mockClear()
  const tree = renderNavigation(<DestinationTabBar pathname={pathname} />)
  const active = tree.hosts().find((node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityState?.selected)!
  press(active)
  expect(mocks.navigate).not.toHaveBeenCalled()
  tree.unmount()
})

it.each([
  ['nav.today', '/(tabs)'], ['nav.calendar', '/calendar'],
  ['nav.progress', '/progress'], ['nav.profile', '/profile'],
])('closes Astra before navigating through %s', (label, route) => {
  mocks.navigate.mockClear()
  useUIStore.getState().setAstraConversationOpen(true)
  const tree = renderNavigation(<DestinationTabBar pathname="/notifications" />)
  try {
    const tab = tree.hosts().find((node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label)!
    press(tab)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(route)
  } finally { tree.unmount() }
})

it('closes Astra when reselecting the current destination', () => {
  useUIStore.getState().setAstraConversationOpen(true)
  const tree = renderNavigation(<DestinationTabBar pathname="/" />)
  try {
    press(tree.hosts().find((node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityState?.selected)!)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  } finally { tree.unmount() }
})
