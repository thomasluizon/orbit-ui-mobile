import { describe, expect, it, vi } from 'vitest'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { press, renderNavigation } from '../ui/navigation-render'
const items = [{ id: 'today', label: 'Hoje' }, { id: 'calendar', label: 'Calendário' }, { id: 'progress', label: 'Progresso' }, { id: 'profile', label: 'Perfil' }]

describe('BottomTabBar', () => {
  it('renders caller words, one current tab and controlled selection without icons', () => {
    const onSelect = vi.fn()
    const tree = renderNavigation(<BottomTabBar items={items} activeId="calendar" onSelect={onSelect} label="Navigation" />)
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    expect(tabs.map((node) => node.props.accessibilityLabel)).toEqual(items.map((item) => item.label))
    expect(tabs.filter((node) => node.props.accessibilityState?.selected)).toEqual([tabs[1]])
    press(tabs[2]!)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('progress')
    onSelect.mockClear()
    press(tabs[1]!)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('calendar')
    expect(tabs[1]!.props.accessibilityState?.selected).toBe(true)
    tree.unmount()
  })
})
