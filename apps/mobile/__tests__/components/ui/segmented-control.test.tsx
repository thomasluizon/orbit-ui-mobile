import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { press, renderNavigation } from './navigation-render'
import { __resetTestHostConfig, __setFocusImpl } from '../../../test-mocks/react-native'
const options = [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }] as const

function keyDown(node: ReturnType<typeof renderNavigation>['hosts'] extends () => (infer THost)[] ? THost : never, key: string) {
  const preventDefault = vi.fn()
  node.props.onKeyDown?.({ nativeEvent: { key }, preventDefault })
  return preventDefault
}

describe('SegmentedControl', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })
  it('selects only another enabled view while retaining caller selection', () => {
    const onChange = vi.fn()
    const tree = renderNavigation(<SegmentedControl options={options} value="active" onChange={onChange} label="Views" />)
    const radios = () => tree.hosts().filter((node) => node.props.accessibilityRole === 'radio')
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Views')).toBe(true)
    expect(radios().filter((node) => node.props.accessibilityState?.checked).map((node) => node.props.testID)).toEqual(['segment-active-selected-enabled'])
    press(radios()[1]!)
    expect(onChange).not.toHaveBeenCalled()
    press(radios()[2]!)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('completed')
    expect(radios()[1]!.props.accessibilityState?.checked).toBe(true)
    tree.unmount()
  })
  it('separates per-option disabled from whole-control disabled', () => {
    const onChange = vi.fn()
    const choices = [options[0], options[1], { ...options[2], disabled: true }] as const
    const tree = renderNavigation(<SegmentedControl options={choices} value="active" onChange={onChange} label="Views" />)
    const radios = () => tree.hosts().filter((node) => node.props.accessibilityRole === 'radio')
    expect(radios()[2]!.props.accessibilityState?.disabled).toBe(true)
    expect(radios()[2]!.props.testID).toBe('segment-completed-unselected-disabled')
    press(radios()[2]!)
    expect(onChange).not.toHaveBeenCalled()
    press(radios()[0]!)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('all')
    onChange.mockClear()
    tree.update(<SegmentedControl options={choices} value="active" onChange={onChange} label="Views" disabled />)
    for (const option of radios()) { expect(option.props.accessibilityState?.disabled).toBe(true); press(option) }
    expect(onChange).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('keeps one tab stop and moves across enabled views with every radio key', () => {
    const onChange = vi.fn()
    const focusedTestIds: string[] = []
    __setFocusImpl((props) => focusedTestIds.push(String(props.testID)))
    const choices = [options[0], { ...options[1], disabled: true }, options[2]] as const
    const tree = renderNavigation(<SegmentedControl options={choices} value="all" onChange={onChange} label="Views" />)
    const radios = tree.hosts().filter((node) => node.props.accessibilityRole === 'radio')

    expect(radios.map((node) => node.props.tabIndex)).toEqual([0, -1, -1])
    expect(keyDown(radios[0]!, 'ArrowDown')).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenLastCalledWith('completed')
    expect(focusedTestIds.at(-1)).toBe('segment-completed-unselected-enabled')
    tree.update(<SegmentedControl options={choices} value="completed" onChange={onChange} label="Views" />)
    const updatedRadios = tree.hosts().filter((node) => node.props.accessibilityRole === 'radio')
    expect(keyDown(updatedRadios[2]!, 'Home')).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenLastCalledWith('all')
    tree.unmount()
  })
})
