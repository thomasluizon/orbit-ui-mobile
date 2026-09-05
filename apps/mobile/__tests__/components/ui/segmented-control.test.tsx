import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { press, renderNavigation } from './navigation-render'
const options = [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }] as const

describe('SegmentedControl', () => {
  it('selects only another enabled view while retaining caller selection', () => {
    const onChange = vi.fn()
    const tree = renderNavigation(<SegmentedControl options={options} value="active" onChange={onChange} label="Views" />)
    const radios = () => tree.hosts().filter((node) => node.props.accessibilityRole === 'radio')
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Views')).toBe(true)
    expect(radios().filter((node) => node.props.accessibilityState?.checked).map((node) => node.props.testID)).toEqual(['segment-active'])
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
})
