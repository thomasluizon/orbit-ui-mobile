import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, Text } from 'react-native'
import { MonthGrid } from '@/components/dates/month-grid'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionIndicator } from '@/components/ui/selection-indicator'
import { motionDurations } from '@orbit/shared/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
const TestRenderer = require('react-test-renderer')

describe('selection motion', () => {
  it('places the calendar selection from measured rows and columns', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    const render = (selectionIndex: number) => <MonthGrid selectionIndex={selectionIndex} weekdayLabels={['1', '2', '3', '4', '5', '6', '7']}><Text>One</Text><Text>Two</Text></MonthGrid>
    TestRenderer.act(() => { tree = TestRenderer.create(render(0)) })
    const row = tree!.root.findByProps({ testID: 'month-grid-row-0' })
    TestRenderer.act(() => row.props.onLayout({ nativeEvent: { layout: { x: 0, y: 20, width: 320, height: 48 } } }))
    const slots = row.findAllByType('View').filter((node: { props: { testID?: string; onLayout?: unknown } }) => !node.props.testID && node.props.onLayout)
    for (const [index, slot] of slots.entries()) TestRenderer.act(() => slot.props.onLayout({ nativeEvent: { layout: { x: index * 48, y: 0, width: 40, height: 48 } } }))
    TestRenderer.act(() => tree!.update(render(1)))
    const indicator = tree!.root.findByProps({ testID: 'selection-motion-indicator' })
    expect(StyleSheet.flatten(indicator.props.style)).toMatchObject({ width: 40, height: 40, transform: [{ translateX: 48 }, { translateY: 24 }] })
    TestRenderer.act(() => tree!.unmount())
  })

  it('moves to measured segment bounds while selection changes immediately', () => {
    const onChange = vi.fn()
    const options = [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] as const
    let tree: ReturnType<typeof TestRenderer.create>
    const render = (value: 'one' | 'two') => <SegmentedControl options={options} value={value} label="View" onChange={onChange} />
    TestRenderer.act(() => { tree = TestRenderer.create(render('one')) })
    for (const [index, value] of ['one', 'two'].entries()) {
      const segment = tree!.root.findByProps({ testID: `segment-${value}-${index ? 'unselected' : 'selected'}-enabled` })
      TestRenderer.act(() => segment.props.onLayout({ nativeEvent: { layout: { x: 4 + index * 80, y: 4, width: 76, height: 48 } } }))
    }
    TestRenderer.act(() => tree!.update(render('two')))
    const indicator = tree!.root.findByProps({ testID: 'selection-motion-indicator' })
    expect(StyleSheet.flatten(indicator.props.style)).toMatchObject({ width: 76, transform: [{ translateX: 84 }, { translateY: 4 }] })
    expect(StyleSheet.flatten(indicator.props.style).transition).toContain(`${motionDurations.fast}ms`)
    TestRenderer.act(() => tree!.unmount())
  })

  it('settles a live reduced-motion change with zero travel duration', () => {
    preference.reduced = false
    let tree: ReturnType<typeof TestRenderer.create>
    const props = { bounds: { x: 80, y: 0, width: 48, height: 48 }, color: 'transparent' }
    TestRenderer.act(() => { tree = TestRenderer.create(<SelectionIndicator {...props} />) })
    preference.reduced = true
    TestRenderer.act(() => tree!.update(<SelectionIndicator {...props} />))
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'selection-motion-indicator' }).props.style).transition).toContain('transform 0ms')
    TestRenderer.act(() => tree!.unmount())
  })
})
