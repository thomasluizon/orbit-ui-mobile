import { expect } from 'vitest'
import { act, type ReactTestInstance } from 'react-test-renderer'
import { PersonalText } from '@/components/ui/personal-text'

export function expandedTextControls(root: ReactTestInstance, name: string, expanded: boolean) {
  return root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === name && (node.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded === expanded)
}

export function pressTextControl(control: ReactTestInstance) {
  const onPress = control.props.onPress
  if (typeof onPress !== 'function') throw new Error('Text control has no press action')
  onPress()
}

export async function expectPersonalTextLayout(root: ReactTestInstance, name: string, lineLimit: 1 | 2 = 2) {
  const text = root.findAll((node) => node.type === PersonalText && node.props.children === name)[0]!
  expect(text).toBeDefined()
  if (/\s/u.test(name) && lineLimit === 2) {
    const probe = text.findAll((node) => String(node.type) === 'Text' && typeof node.props.onTextLayout === 'function')[0]!
    const onTextLayout = probe.props.onTextLayout
    if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
    const split = name.indexOf(' ') + 5
    await act(() => onTextLayout({ nativeEvent: { lines: [name.slice(0, split), name.slice(split)].map((line) => ({ text: line, x: 0, y: 0, width: 100, height: 24, descender: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } }))
  }
  const visible = text.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants')
  expect(visible).toHaveLength(/\s/u.test(name) && lineLimit === 2 ? 2 : 1)
  expect(visible.map((node) => node.props.children).join(' ')).toBe(name)
  for (const line of visible) expect(line.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
  expect(text.findAll((node) => node.props.accessibilityLabel === name).length).toBeGreaterThan(0)
}
