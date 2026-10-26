import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PickerRow } from '@/components/ui/picker-row'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

async function measure(tree: ReactTestRenderer, lines: string[]) {
  const probe = tree.root.findAll((node) => String(node.type) === 'Text' && typeof node.props.onTextLayout === 'function')[0]!
  const onTextLayout = probe.props.onTextLayout
  if (typeof onTextLayout !== 'function') throw new Error('Text measurement callback missing')
  await act(() => onTextLayout({ nativeEvent: { lines: lines.map((text, index) => ({ text, x: 0, y: index * 20, width: 100, height: 20, descender: 0, capHeight: 16, ascender: 18, xHeight: 12 })) } }))
}

function disclosures(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => String(node.type) === 'Pressable' && typeof node.props.accessibilityState === 'object' && node.props.accessibilityState !== null && 'expanded' in node.props.accessibilityState)
}

describe('overflow-only personal text disclosure', () => {
  it.each([1, 2] as const)('shows only plain text for a fitting %s-line label', async (lines) => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PersonalTextDetails lines={lines}>Read for 20 minutes</PersonalTextDetails>) })
    try {
      await measure(tree, ['Read for 20 minutes'])
      expect(disclosures(tree)).toHaveLength(0)
      expect(tree.root.findAll((node) => String(node.type) === 'ChevronDown')).toHaveLength(0)
      expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Read for 20 minutes').length).toBeGreaterThan(0)
    } finally { await act(() => tree.update(<></>)) }
  })

  it.each([1, 2] as const)('expands overflowing %s-line text and removes the control after reflow', async (lines) => {
    const name = 'Read for 20 minutes every morning before breakfast'
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PersonalTextDetails lines={lines}>{name}</PersonalTextDetails>) })
    try {
      await measure(tree, ['Read for 20 minutes ', 'every morning ', 'before breakfast'])
      expect(disclosures(tree)).toHaveLength(1)
      expect(tree.root.findAll((node) => String(node.type) === 'ChevronDown')).toHaveLength(1)
      await act(() => (disclosures(tree)[0]!.props.onPress as () => void)())
      expect((disclosures(tree)[0]!.props.accessibilityState as { expanded: boolean }).expanded).toBe(true)
      expect(tree.root.findAll((node) => node.type === PersonalText && node.props.expanded === true)).toHaveLength(1)
      await measure(tree, [name])
      expect(disclosures(tree)).toHaveLength(0)
      expect(tree.root.findAll((node) => node.type === PersonalText && node.props.expanded === true)).toHaveLength(0)
      await measure(tree, ['Read for 20 minutes ', 'every morning ', 'before breakfast'])
      expect((disclosures(tree)[0]!.props.accessibilityState as { expanded: boolean }).expanded).toBe(false)
    } finally { await act(() => tree.update(<></>)) }
  })

  it('detects an ellipsized single token even with the two-line default', async () => {
    const name = 'averylongunbrokenpersonalname'
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PersonalTextDetails>{name}</PersonalTextDetails>) })
    try {
      await measure(tree, ['averylongunbroken', 'personalname'])
      expect(disclosures(tree)).toHaveLength(1)
    } finally { await act(() => tree.update(<></>)) }
  })

  it('resets expansion and disclosure when the text changes', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PersonalTextDetails>Read every morning before breakfast</PersonalTextDetails>) })
    try {
      await measure(tree, ['Read every ', 'morning before ', 'breakfast'])
      await act(() => (disclosures(tree)[0]!.props.onPress as () => void)())
      await act(() => tree.update(<PersonalTextDetails>Read</PersonalTextDetails>))
      await measure(tree, ['Read'])
      expect(disclosures(tree)).toHaveLength(0)
    } finally { await act(() => tree.update(<></>)) }
  })

  it('uses the visible picker label measurement without changing selection', async () => {
    const onToggle = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PickerRow name="Read every morning before breakfast" selected disabled={false} onToggle={onToggle} value="3" valueStyle={{}} />) })
    try {
      await measure(tree, ['Read every morning before breakfast'])
      expect(disclosures(tree)).toHaveLength(0)
      await measure(tree, ['Read every ', 'morning before ', 'breakfast'])
      expect(disclosures(tree)).toHaveLength(1)
      expect(onToggle).not.toHaveBeenCalled()
      await measure(tree, ['Read every morning before breakfast'])
      expect(disclosures(tree)).toHaveLength(0)
    } finally { await act(() => tree.update(<></>)) }
  })
})
