import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, Text } from 'react-native'
import { MonthGrid } from '@/components/dates/month-grid'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionIndicator } from '@/components/ui/selection-indicator'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { SwitchTrack } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Chip } from '@/components/ui/chip'
import { RadioRow } from '@/components/ui/select-check'
import { createTokensV2 } from '@/lib/theme'
import { PRESS_SCALE_TRANSITION } from '@/components/motion/press-scale'
import { motionDurations, motionPresets } from '@orbit/shared/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => preference.reduced }))
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
    expect(StyleSheet.flatten(indicator.props.style)).toMatchObject({ width: 34, height: 34, transform: [{ translateX: 49 }, { translateY: 27 }] })
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

  it('settles a ringed control ring on the selection preset as it is selected and on its shorter exit as it is cleared', () => {
    preference.reduced = false
    const { enterDuration, exitDuration, enterEasing, exitEasing } = motionPresets.selection
    let tree: ReturnType<typeof TestRenderer.create>
    const render = (selected: boolean) => <MotionPressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} selectionRingWidth={1.5} selectionRingColor="#C4530F" />
    const host = () => StyleSheet.flatten(tree!.root.findAll((node: { type: unknown }) => typeof node.type === 'string')[0]!.props.style)
    TestRenderer.act(() => { tree = TestRenderer.create(render(false)) })
    expect(host()).toMatchObject({ borderColor: 'transparent', transition: `${PRESS_SCALE_TRANSITION}, border-color ${exitDuration}ms cubic-bezier(${exitEasing.join(',')})` })
    TestRenderer.act(() => tree!.update(render(true)))
    expect(host()).toMatchObject({ borderWidth: 1.5, borderColor: '#C4530F', transition: `${PRESS_SCALE_TRANSITION}, border-color ${enterDuration}ms cubic-bezier(${enterEasing.join(',')})` })
    preference.reduced = true
    TestRenderer.act(() => tree!.update(render(true)))
    expect(host().transition).toBe('none')
    TestRenderer.act(() => tree!.unmount())
    preference.reduced = false
  })

  it.each([false, true])('settles the checkbox fill on the selection preset, and at once under reduced motion %s', (reduced) => {
    preference.reduced = reduced
    const { enterDuration, exitDuration, enterEasing, exitEasing } = motionPresets.selection
    const tokens = createTokensV2('orange', 'dark')
    let tree: ReturnType<typeof TestRenderer.create>
    const box = () => StyleSheet.flatten(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props['data-slot'] === 'checkbox-box')[0]!.props.style)
    TestRenderer.act(() => { tree = TestRenderer.create(<Checkbox checked={false} onChange={vi.fn()} label="Done" />) })
    expect(box()).toMatchObject({ backgroundColor: 'transparent', transition: reduced ? 'none' : `background-color ${exitDuration}ms cubic-bezier(${exitEasing.join(',')})` })
    TestRenderer.act(() => tree!.update(<Checkbox checked onChange={vi.fn()} label="Done" />))
    expect(box()).toMatchObject({ backgroundColor: tokens.statusDone, transition: reduced ? 'none' : `background-color ${enterDuration}ms cubic-bezier(${enterEasing.join(',')})` })
    TestRenderer.act(() => tree!.unmount())
    preference.reduced = false
  })

  it.each([
    ['chip', (selected: boolean) => <Chip active={selected}>Chip</Chip>, 1],
    ['period chip', (selected: boolean) => <Chip variant="period" active={selected}>Chip</Chip>, 1.5],
    ['radio row', (selected: boolean) => <RadioRow label="Radio" selected={selected} onSelect={vi.fn()} />, 1.5],
  ] as const)('settles the %s ring over its own border band on the selection preset, and at once under reduced motion', (_name, render, width) => {
    const { enterDuration, exitDuration, enterEasing, exitEasing } = motionPresets.selection
    for (const reduced of [false, true]) {
      preference.reduced = reduced
      let tree: ReturnType<typeof TestRenderer.create>
      const ring = () => StyleSheet.flatten(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'selection-ring')[0]!.props.style)
      TestRenderer.act(() => { tree = TestRenderer.create(render(false)) })
      expect(ring()).toMatchObject({ borderColor: 'transparent', transition: reduced ? 'none' : `border-color ${exitDuration}ms cubic-bezier(${exitEasing.join(',')})` })
      TestRenderer.act(() => tree!.update(render(true)))
      expect(ring()).toMatchObject({ position: 'absolute', top: -width, left: -width, borderWidth: width, transition: reduced ? 'none' : `border-color ${enterDuration}ms cubic-bezier(${enterEasing.join(',')})` })
      expect(ring().borderColor).not.toBe('transparent')
      TestRenderer.act(() => tree!.unmount())
    }
    preference.reduced = false
  })

  it('keeps the caller resting border under a ringed control until it is selected', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    const render = (selected: boolean) => <MotionPressable accessibilityRole="button" accessibilityState={{ selected }} selectionRingWidth={1.5} selectionRingColor="#C4530F" style={{ borderWidth: 1, borderColor: '#2A2A2E' }} />
    const host = () => StyleSheet.flatten(tree!.root.findAll((node: { type: unknown }) => typeof node.type === 'string')[0]!.props.style)
    TestRenderer.act(() => { tree = TestRenderer.create(render(false)) })
    expect(host()).toMatchObject({ borderWidth: 1, borderColor: '#2A2A2E' })
    TestRenderer.act(() => tree!.update(render(true)))
    expect(host()).toMatchObject({ borderWidth: 1.5, borderColor: '#C4530F' })
    TestRenderer.act(() => tree!.unmount())
  })

  it('keeps an unringed control on the press transition alone', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<MotionPressable accessibilityRole="button" accessibilityState={{ selected: true }} />) })
    expect(StyleSheet.flatten(tree!.root.findAll((node: { type: unknown }) => typeof node.type === 'string')[0]!.props.style).transition).toBe(PRESS_SCALE_TRANSITION)
    TestRenderer.act(() => tree!.unmount())
  })

  it.each([false, true])('slides the switch thumb on the selection preset, and at once under reduced motion %s', (reduced) => {
    preference.reduced = reduced
    const { enterDuration, enterEasing } = motionPresets.selection
    let tree: ReturnType<typeof TestRenderer.create>
    const thumb = () => StyleSheet.flatten(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props['data-slot'] === 'switch-thumb')[0]!.props.style)
    TestRenderer.act(() => { tree = TestRenderer.create(<SwitchTrack checked={false} />) })
    expect(thumb()).toMatchObject({ transform: [{ translateX: 3 }], transition: `transform ${reduced ? 0 : enterDuration}ms cubic-bezier(${enterEasing.join(',')})` })
    TestRenderer.act(() => tree!.update(<SwitchTrack checked />))
    expect(thumb().transform).toEqual([{ translateX: 23 }])
    TestRenderer.act(() => tree!.unmount())
    preference.reduced = false
  })
})
