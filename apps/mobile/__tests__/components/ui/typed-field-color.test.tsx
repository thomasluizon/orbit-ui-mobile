import React, { useState } from 'react'
import { StyleSheet, type TextStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { buildHabitUnderstandingLabels, readHabitPhrase, segmentHabitPhrase } from '@orbit/shared/utils'
import { TypedTextInput } from '@/components/ui/typed-text-input'
import { AppTextInput } from '@/components/ui/app-text-input'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { Input } from '@/components/ui/input'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { createTokensV2 } from '@/lib/theme'

interface RenderedNode {
  type: unknown
  parent: RenderedNode | null
  props: {
    value: string
    style: TextStyle
    placeholderTextColor: string
    children?: React.ReactNode
    onChangeText: (value: string) => void
    onFocus: (event: object) => void
    onBlur: (event: object) => void
  }
  findByType: (type: string) => RenderedNode
  findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
}
interface RenderedTree {
  root: RenderedNode
  unmount: () => void
}
const renderer: {
  create: (element: React.ReactElement) => RenderedTree
  act: (callback: () => void) => void
} = require('react-test-renderer')
const theme = vi.hoisted(() => ({ currentScheme: 'orange', currentTheme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))

const labels = buildHabitUnderstandingLabels((key) => key)

function resolvedTextStyle(node: RenderedNode): TextStyle {
  const styles: TextStyle[] = []
  for (let ancestor: RenderedNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type === 'Text') styles.unshift(ancestor.props.style)
  }
  return StyleSheet.flatten(styles)
}

function HabitName() {
  const [value, setValue] = useState('')
  const phrase = readHabitPhrase(value, 'en')
  return <HabitUnderstanding value={value} consumed={phrase.consumed} days={phrase.days} dayOptions={[]} quantity={1} mode="fixed" sentence={null} emoji="" labels={labels} onValueChange={setValue} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} />
}

function Field({ kind, multiline }: Readonly<{ kind: string; multiline: boolean }>) {
  const [value, setValue] = useState('')
  if (kind === 'Input') return multiline ? <Input label="Name" value={value} onChange={setValue} multiline /> : <Input label="Name" value={value} onChange={setValue} />
  const Primitive = kind === 'TypedTextInput' ? TypedTextInput : kind === 'AppTextInput' ? AppTextInput : BottomSheetAppTextInput
  return <Primitive accessibilityLabel="Name" value={value} onChangeText={setValue} multiline={multiline} onFocus={vi.fn()} onBlur={vi.fn()} style={{ color: 'transparent', paddingHorizontal: 8 }} />
}

describe.each(['light', 'dark'] as const)('typed field foreground in %s', (mode) => {
  it.each(['Input', 'AppTextInput', 'BottomSheetAppTextInput', 'TypedTextInput'].flatMap((kind) => [false, true].map((multiline) => ({ kind, multiline }))))('paints $kind multiline=$multiline with the theme foreground after typing and focus', ({ kind, multiline }) => {
    theme.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    let tree!: ReturnType<typeof renderer.create>
    renderer.act(() => { tree = renderer.create(<Field kind={kind} multiline={multiline} />) })
    const control = () => tree.root.findByType('TextInput')
    renderer.act(() => { control().props.onChangeText('testtxxx'); control().props.onFocus({}) })
    expect(control().props.value).toBe('testtxxx')
    expect(StyleSheet.flatten(control().props.style).color).toBe(tokens.fg1)
    expect(control().props.placeholderTextColor).toBe(tokens.fg3)
    if (kind !== 'Input') expect(StyleSheet.flatten(control().props.style).paddingHorizontal).toBe(8)
    renderer.act(() => control().props.onBlur({}))
    expect(StyleSheet.flatten(control().props.style).color).toBe(tokens.fg1)
    renderer.act(() => tree.unmount())
  })

  it.each(['Run Monday', 'Run Monday and Friday at 08:00', 'Walk every day'])('paints the habit input and Android consumed-word underlines for "%s" after editing', (phrase) => {
    theme.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    let tree!: ReturnType<typeof renderer.create>
    renderer.act(() => { tree = renderer.create(<HabitName />) })
    const control = () => tree.root.findByType('TextInput')
    renderer.act(() => { control().props.onFocus({}); control().props.onChangeText(phrase) })
    expect(control().props.value).toBe(phrase)
    expect(StyleSheet.flatten(control().props.style).color).toBe(tokens.fg1)
    const consumedSegments = segmentHabitPhrase(phrase, readHabitPhrase(phrase, 'en').consumed).filter((segment) => segment.consumed)
    expect(consumedSegments.length).toBeGreaterThan(0)
    const marks = tree.root.findAll((node) => node.type === 'Text' && StyleSheet.flatten([node.props.style]).textDecorationLine === 'underline')
    expect(marks.map((mark) => mark.props.children)).toEqual(consumedSegments.map((segment) => segment.text))
    for (const mark of marks) {
      const underlinePaint = resolvedTextStyle(mark)
      expect(underlinePaint).toMatchObject({ backgroundColor: tokens.bgWell, textDecorationLine: 'underline', color: tokens.hairlineStrong })
      expect(underlinePaint.textDecorationColor).toBeUndefined()
    }
    renderer.act(() => { control().props.onChangeText('testtxxx'); control().props.onBlur({}) })
    expect(control().props.value).toBe('testtxxx')
    expect(StyleSheet.flatten(control().props.style).color).toBe(tokens.fg1)
    expect(tree.root.findAll((node) => node.type === 'Text' && StyleSheet.flatten([node.props.style]).textDecorationLine === 'underline')).toHaveLength(0)
    renderer.act(() => tree.unmount())
  })
})
