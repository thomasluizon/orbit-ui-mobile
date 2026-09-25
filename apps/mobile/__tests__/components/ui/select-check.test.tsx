import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioGlyph, RadioRow } from '@/components/ui/select-check'
import { FocusProvenanceView } from '@/components/ui/focus-provenance-view'
import { createTokensV2 } from '@/lib/theme'
import { focusHost } from '../../support/focus-provenance'
import {
  __resetTestHostConfig,
  __setFocusImpl,
} from '../../../test-mocks/react-native'

function RadioRows({ onChange }: Readonly<{ onChange: (value: string) => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <FocusProvenanceView>
      <RadioGroup accessibilityLabel="Cadence">
        <RadioRow label="First" selected={value === 'first'} onSelect={() => select('first')} />
        <RadioRow label="Second" selected={value === 'second'} onSelect={() => select('second')} />
        <RadioRow label="Third" selected={value === 'third'} onSelect={() => select('third')} />
        <RadioRow label="Last" selected={value === 'last'} onSelect={() => select('last')} />
      </RadioGroup>
    </FocusProvenanceView>
  )
}

function CommitRows({
  onChange,
  onCommit,
}: Readonly<{ onChange: (value: string) => void; onCommit: () => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <FocusProvenanceView>
      <RadioGroup accessibilityLabel="Cadence" onCommit={onCommit}>
        <RadioRow label="First" selected={value === 'first'} onSelect={() => select('first')} />
        <RadioRow label="Second" selected={value === 'second'} onSelect={() => select('second')} />
      </RadioGroup>
    </FocusProvenanceView>
  )
}

function FocusEntryRows({
  initialValue = 'second',
  onChange,
}: Readonly<{
  initialValue?: string | null
  onChange: (value: string) => void
}>) {
  const [value, setValue] = useState<string | null>(initialValue)
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <FocusProvenanceView>
      <RadioGroup accessibilityLabel="Entry">
        <RadioRow label="First" selected={value === 'first'} onSelect={() => select('first')} />
        <RadioRow label="Second" selected={value === 'second'} onSelect={() => select('second')} />
        <RadioRow label="Third" selected={value === 'third'} onSelect={() => select('third')} />
      </RadioGroup>
      <View focusable accessibilityLabel="Outside" />
    </FocusProvenanceView>
  )
}

/** No FocusProvenanceView, which is the tree a caller builds outside the root layout. */
function UnprovenancedRows({ onChange }: Readonly<{ onChange: (value: string) => void }>) {
  const [value, setValue] = useState('first')
  const select = (nextValue: string) => {
    setValue(nextValue)
    onChange(nextValue)
  }

  return (
    <RadioGroup accessibilityLabel="Cadence">
      <RadioRow label="First" selected={value === 'first'} onSelect={() => select('first')} />
      <RadioRow label="Second" selected={value === 'second'} onSelect={() => select('second')} />
    </RadioGroup>
  )
}

function renderEntryRows(onChange: (value: string) => void, initialValue?: string | null) {
  let tree: any
  void act(() => {
    tree = create(<FocusEntryRows initialValue={initialValue} onChange={onChange} />)
  })
  const radios = tree.root.findAll(
    (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
  )
  const outside = tree.root.find(
    (node: any) => node.props.accessibilityLabel === 'Outside' && typeof node.type === 'string',
  )
  return { outside, radios, tree }
}

describe('select-check RadioRow group', () => {
  it('uses the selected row tint and ring', () => {
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={vi.fn()} />)
    })
    const selected = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )[0]

    const tokens = createTokensV2('purple', 'dark')
    expect(selected.props.style({ pressed: false })).toEqual(expect.arrayContaining([
      expect.objectContaining({ backgroundColor: tokens.selectionBg, borderColor: tokens.primary }),
    ]))
    const unselectedGlyph = tree.root.findAllByType(RadioGlyph)[1].findByType(View)
    expect(unselectedGlyph.props.style).toEqual(expect.arrayContaining([
      { borderWidth: 2, borderColor: tokens.trackEmpty },
    ]))
  })

  beforeEach(() => {
    __resetTestHostConfig()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('changes the value on a focus move without committing the group', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<CommitRows onChange={onChange} onCommit={onCommit} />)
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => focusHost(tree, radios[0]))
    void act(() => focusHost(tree, radios[1]))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('second')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('selects the focused row instead of redirecting when no focus provenance exists', () => {
    const onChange = vi.fn()
    const focused: unknown[] = []
    __setFocusImpl((props) => focused.push(props.accessibilityLabel))
    let tree: any
    void act(() => {
      tree = create(<UnprovenancedRows onChange={onChange} />)
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => radios[1]!.props.onFocus())

    expect(onChange).toHaveBeenCalledExactlyOnceWith('second')
    expect(focused).toEqual([])
  })

  it('commits the group only when a row is pressed', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<CommitRows onChange={onChange} onCommit={onCommit} />)
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => radios[1]!.props.onPress())

    expect(onChange).toHaveBeenCalledExactlyOnceWith('second')
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('redirects initial entry to the checked row without changing selection', () => {
    const onChange = vi.fn()
    const focus = vi.fn()
    __setFocusImpl(focus)
    const { tree, radios: [first] } = renderEntryRows(onChange)

    void act(() => focusHost(tree, first))

    expect(onChange).not.toHaveBeenCalled()
    expect(first.props.accessibilityState.checked).toBe(false)
    expect(focus).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        accessibilityState: expect.objectContaining({ checked: true }),
      }),
    )
  })

  it('selects a new row when focus moves inside the group', () => {
    const onChange = vi.fn()
    const { tree, radios: [first, second] } = renderEntryRows(onChange)

    void act(() => focusHost(tree, second))
    void act(() => focusHost(tree, first))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('first')
  })

  it('treats immediate re-entry as entry after focus leaves the group', () => {
    const onChange = vi.fn()
    const { tree, outside, radios: [first, second] } = renderEntryRows(onChange)

    void act(() => {
      focusHost(tree, second)
      focusHost(tree, outside)
      focusHost(tree, first)
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves initial focus in place when no row is checked', () => {
    const onChange = vi.fn()
    const focus = vi.fn()
    __setFocusImpl(focus)
    const { tree, radios: [first] } = renderEntryRows(onChange, null)

    void act(() => focusHost(tree, first))

    expect(onChange).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('selects the next row reached after an entry that found nothing checked', () => {
    const onChange = vi.fn()
    const focus = vi.fn()
    __setFocusImpl(focus)
    const { tree, radios: [first, , third] } = renderEntryRows(onChange, null)

    void act(() => focusHost(tree, third))
    expect(focus).not.toHaveBeenCalled()

    void act(() => focusHost(tree, first))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('first')
  })

  it('keeps enabled rows focusable, leaves traversal to the platform, and selects on focus', () => {
    const onChange = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={onChange} />)
    })
    const radios = () => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    const options = radios()
    const handles = options.map((option: any) => option.props.__nativeTag)
    const [first, , third] = options
    expect(options.map((option: any) => option.props.focusable)).toEqual([true, true, true, true])
    expect(handles.every((handle: unknown) => typeof handle === 'number')).toBe(true)
    for (const direction of [
      'nextFocusDown',
      'nextFocusForward',
      'nextFocusLeft',
      'nextFocusRight',
      'nextFocusUp',
    ]) {
      expect(options.every((option: any) => option.props[direction] === undefined)).toBe(true)
    }
    expect(options.every((option: any) => option.props.onKeyDown === undefined)).toBe(true)
    void act(() => focusHost(tree, first))
    void act(() => focusHost(tree, third))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
  })

  it('makes one focusable host per radio option and nothing else', () => {
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={vi.fn()} />)
    })

    const focusableHosts = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.focusable === true,
    )
    const options = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    expect(options).toHaveLength(4)
    expect(focusableHosts.map((host: any) => host.props.accessibilityRole))
      .toEqual(options.map(() => 'radio'))
  })

  it('commits without selecting again when a press lands on the focused row', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<CommitRows onChange={onChange} onCommit={onCommit} />)
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => focusHost(tree, radios[0]))
    void act(() => focusHost(tree, radios[1]))
    void act(() => radios[1]!.props.onPress())

    expect(onChange).toHaveBeenCalledExactlyOnceWith('second')
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('keeps touch selection unchanged', () => {
    const onChange = vi.fn()
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={onChange} />)
    })
    const controls = tree.root.findAllByType(Pressable)
    void act(() => controls[2].props.onPress())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('third')
  })
})
