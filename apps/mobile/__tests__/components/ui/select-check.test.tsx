import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioGlyph, RadioRow } from '@/components/ui/select-check'
import { FocusProvenanceView } from '@/components/ui/focus-provenance-view'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { focusHost } from '../../support/focus-provenance'
import {
  __resetTestHostConfig,
  __setFocusImpl,
  __setTouchMode,
} from '../../../test-mocks/react-native'

const themeState = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({ currentScheme: 'orange', currentTheme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => themeState }))
const motionState = vi.hoisted(() => ({ prefersReducedMotion: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => motionState.prefersReducedMotion }))

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
  it.each([false, true])('announces personal text and supporting metadata when disabled=%s', (disabled) => {
    const label = `${'longaddress'.repeat(12)}@example.com`
    let tree!: ReactTestRenderer
    void act(() => {
      tree = create(disabled
        ? <RadioRow label={label} textMode="personal" description="Details" meta="3" tag="Current" disabled reason="Sending" />
        : <RadioRow label={label} textMode="personal" description="Details" meta="3" tag="Current" selected onSelect={vi.fn()} />)
    })
    const radio = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')[0]!
    expect(radio.props.accessibilityLabel).toBe(disabled
      ? `${label}, Details, 3, Current, Sending`
      : `${label}, Details, 3, Current`)
    expect(radio.props.accessibilityState).toEqual(disabled
      ? { checked: false, disabled: true }
      : { checked: true })
    void act(() => tree.update(<View />))
  })

  it('uses the selected row tint and ring', () => {
    let tree: any
    void act(() => {
      tree = create(<RadioRows onChange={vi.fn()} />)
    })
    const selected = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )[0]

    const tokens = createTokensV2('purple', 'dark')
    expect(StyleSheet.flatten(selected.props.style({ pressed: false }))).toMatchObject({
      backgroundColor: tokens.selectionBg, borderColor: tokens.primary, borderWidth: 1.5,
    })
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

    const target = {}
    void act(() => radios[1]!.props.onFocus({ target, currentTarget: target }))

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
    __setTouchMode(false)
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

describe('RadioRow press feedback', () => {
  afterEach(() => { motionState.prefersReducedMotion = false })

  const states = [false, true].flatMap((reducedMotion) =>
    [false, true].map((selected) => ({ reducedMotion, selected })),
  )
  it.each(states)('keeps press feedback accessible with reducedMotion=$reducedMotion, selected=$selected', ({ reducedMotion, selected }) => {
    motionState.prefersReducedMotion = reducedMotion
    const onSelect = vi.fn()
    let tree!: ReactTestRenderer
    void act(() => {
      tree = create(<RadioGroup accessibilityLabel="Subjects">
        <RadioRow label="Subject" selected={selected} onSelect={onSelect} />
      </RadioGroup>)
    })
    const row = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')[0]!
    const pressStyle = row.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
    const accessibilityState = row.props.accessibilityState as { checked: boolean }
    const onPress = row.props.onPress as () => void
    const style = (pressed: boolean) => StyleSheet.flatten(pressStyle({ pressed }))
    const tokens = createTokensV2('orange', 'dark')

    expect(style(false).transform).toBeUndefined()
    expect(style(true).transform).toEqual(reducedMotion ? undefined : [{ scale: 0.96 }])
    expect(style(true).backgroundColor).toBe(tokens.bgHover)
    expect(accessibilityState.checked).toBe(selected)
    expect(onSelect).not.toHaveBeenCalled()
    void act(() => onPress())
    expect(onSelect).toHaveBeenCalledTimes(selected ? 0 : 1)
    expect(style(false).transform).toBeUndefined()
    expect(style(false).backgroundColor).toBe(selected ? tokens.selectionBg : 'transparent')
    void act(() => tree.update(<View />))
  })

  it('responds to a reduced-motion preference change while pressed', () => {
    let tree!: ReactTestRenderer
    const renderRow = () => <RadioGroup accessibilityLabel="Subjects">
      <RadioRow label="Subject" onSelect={vi.fn()} />
    </RadioGroup>
    void act(() => { tree = create(renderRow()) })
    const pressedStyle = () => {
      const row = tree.root.findAll((node) => node.type === Pressable)[0]!
      const style = row.props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
      return StyleSheet.flatten(style({ pressed: true }))
    }
    expect(pressedStyle().transform).toEqual([{ scale: 0.96 }])
    motionState.prefersReducedMotion = true
    void act(() => { tree.update(renderRow()) })
    expect(pressedStyle().transform).toBeUndefined()
    expect(pressedStyle().backgroundColor).toBe(createTokensV2('orange', 'dark').bgHover)
    motionState.prefersReducedMotion = false
    void act(() => { tree.update(renderRow()) })
    expect(pressedStyle().transform).toEqual([{ scale: 0.96 }])
    void act(() => { tree.update(<View />) })
  })
})

describe('RadioRow secondary text contrast', () => {
  afterEach(() => { themeState.currentTheme = 'dark' })

  const states = (['dark', 'light'] as const).flatMap((mode) =>
    [false, true].flatMap((selected) => [false, true].map((disabled) => ({ mode, selected, disabled }))),
  )
  it.each(states)('keeps secondary text readable in $mode, selected=$selected, disabled=$disabled', ({ mode, selected, disabled }) => {
    themeState.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    const expectedForeground = selected ? tokens.fg2 : tokens.fg3
    let tree!: ReactTestRenderer
    const onSelect = vi.fn()
    void act(() => {
      tree = create(disabled
        ? <RadioRow label="Subject" description="Details" meta="3" tag="Current" selected={selected} disabled reason="Sending" />
        : <RadioRow label="Subject" description="Details" meta="3" tag="Current" selected={selected} onSelect={onSelect} />)
    })
    const row = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')[0]!
    const description = tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'Details')[0]!
    const descriptionStyle = StyleSheet.flatten(description.props.style) as { color: string; fontSize: number }
    const meta = tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === '3')[0]!
    const metaStyle = StyleSheet.flatten(meta.props.style) as { color: string; fontSize: number }
    const tag = tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'Current')[0]!
    const tagStyle = StyleSheet.flatten(tag.props.style) as { color: string; fontSize: number }
    const foregrounds = [descriptionStyle.color, metaStyle.color, tagStyle.color]
    expect(metaStyle.fontSize).toBe(12)
    expect(tagStyle.fontSize).toBe(12)
    const pressStyle = row.props.style as (state: { pressed: boolean }) => unknown
    const accessibilityState = row.props.accessibilityState as { checked: boolean; disabled?: boolean }
    const rowStyle = StyleSheet.flatten(disabled ? row.props.style : pressStyle({ pressed: false })) as { backgroundColor: string; opacity: number }
    expect(descriptionStyle.fontSize).toBe(14)
    expect(rowStyle.backgroundColor).toBe(selected ? tokens.selectionBg : 'transparent')
    expect(rowStyle.opacity).toBe(disabled ? 0.5 : 1)
    expect(accessibilityState.checked).toBe(selected)
    expect(row.props.accessibilityLabel).toBe(disabled ? 'Subject, Details, 3, Current, Sending' : 'Subject, Details, 3, Current')
    if (disabled) {
      const reason = tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === 'Sending')[0]!
      const reasonStyle = StyleSheet.flatten(reason.props.style) as { color: string; fontSize: number }
      expect(reasonStyle.fontSize).toBe(12)
      expect(reasonStyle.color).toBe(expectedForeground)
      expect(accessibilityState.disabled).toBe(true)
      expect(row.props.onPress).toBeUndefined()
      expect(row.props.focusable).toBe(false)
    } else {
      for (const surface of [[], [tokens.bgCard], [tokens.bgSheet]]) {
        const layers = [tokens.bg, ...surface, ...(selected ? [rowStyle.backgroundColor] : [])]
        foregrounds.forEach((foreground) => {
          expect(contrastOnSurface(foreground, layers), `${mode}, selected=${selected}, ${surface.join(',')}`)
            .toBeGreaterThanOrEqual(4.5)
        })
      }
      const pressed = StyleSheet.flatten(pressStyle({ pressed: true })) as { backgroundColor: string; opacity: number }
      const pressable = tree.root.findAll((node) => node.type === Pressable)[0]!
      const content = pressable.props.children as ReactNode | ((state: { pressed: boolean }) => ReactNode)
      void act(() => {
        tree.update(<View>{typeof content === 'function' ? content({ pressed: true }) : content}</View>)
      })
      const pressedForegrounds = ['Details', '3', 'Current'].map((text) => {
        const label = tree.root.findAll((node) => typeof node.type === 'string' && node.props.children === text)[0]!
        return (StyleSheet.flatten(label.props.style) as { color: string }).color
      })
      const pressedContrasts = [[], [tokens.bgCard], [tokens.bgSheet]].flatMap((surface) =>
        pressedForegrounds.map((foreground) => contrastOnSurface(foreground, [tokens.bg, ...surface, pressed.backgroundColor])),
      )
      expect(Math.min(...pressedContrasts)).toBeGreaterThanOrEqual(4.5)
      const glyph = tree.root.findAll((node) => node.type === RadioGlyph)[0]!
      const glyphHost = glyph.findAll((node) => typeof node.type === 'string')[0]!
      const glyphStyle = StyleSheet.flatten(glyphHost.props.style) as { borderColor: string }
      if (!selected) {
        const trackContrasts = [[], [tokens.bgCard], [tokens.bgSheet]].map((surface) =>
          contrastOnSurface(glyphStyle.borderColor, [tokens.bg, ...surface, pressed.backgroundColor]),
        )
        expect(trackContrasts).toHaveLength(3)
        expect(Math.min(...trackContrasts)).toBeGreaterThanOrEqual(3)
      }
    }
    expect(descriptionStyle.color).toBe(expectedForeground)
    expect(metaStyle.color).toBe(expectedForeground)
    expect(tagStyle.color).toBe(expectedForeground)
    void act(() => { tree.update(<View />) })
  })
})
