import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from '@/components/ui/chip'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { RadioRow } from '@/components/ui/select-check'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('orange', 'dark')

function ringCount(host: { props: { style: unknown }; findAllByType: (type: string) => { props: { style: unknown } }[] }) {
  return [host, ...host.findAllByType('View')].reduce((count, node) => {
    const style = StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style)
    return count + (style?.outlineWidth > 0 ? 1 : 0) + (style?.borderWidth > 0 && [tokens.primary, tintFromPrimary(tokens, 0.45)].includes(style.borderColor) ? 1 : 0)
  }, 0)
}

describe('selected controls share one focus indicator', () => {
  for (const selected of [false, true]) {
    for (const variant of ['default', 'period'] as const) {
      it(`Chip ${variant}, selected ${selected}`, () => {
        verify(<Chip active={selected} variant={variant}>Chip</Chip>, selected)
      })
    }
    for (const fullWidth of [false, true]) {
      it(`SegmentedControl fullWidth ${fullWidth}, selected ${selected}`, () => {
        verify(<SegmentedControl label="View" fullWidth={fullWidth} value={selected ? 'one' : 'two'} options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} onChange={vi.fn()} />, selected)
      })
    }
    it(`RadioRow selected ${selected}`, () => {
      verify(<RadioRow label="Radio" selected={selected} onSelect={vi.fn()} />, selected)
    })
  }
  it.each([false, true])('track uses a padded borderless well, fullWidth %s', (fullWidth) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<SegmentedControl label="View" fullWidth={fullWidth} value="one" options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} onChange={vi.fn()} />) })
    const group = tree!.root.findByProps({ accessibilityRole: 'radiogroup' })
    expect(StyleSheet.flatten(group.props.style)).toMatchObject({ padding: 4, gap: 4, borderRadius: 12, backgroundColor: tokens.bgWell })
    expect(StyleSheet.flatten(group.props.style).borderWidth ?? 0).toBe(0)
    TestRenderer.act(() => tree!.unmount())
  })
})

function verify(element: React.ReactNode, selected: boolean) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  const host = () => tree!.root.findAllByType('Pressable')[0]
  expect(ringCount(host())).toBe(selected ? 1 : 0)
  const target = {}
  const event = { target, currentTarget: target }
  TestRenderer.act(() => host().props.onFocus?.(event))
  expect(ringCount(host())).toBe(1)
  TestRenderer.act(() => host().props.onBlur?.(event))
  expect(ringCount(host())).toBe(selected ? 1 : 0)
  TestRenderer.act(() => tree!.unmount())
}
