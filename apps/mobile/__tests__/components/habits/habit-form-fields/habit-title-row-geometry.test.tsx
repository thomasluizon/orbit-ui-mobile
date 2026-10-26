import React from 'react'
import { StyleSheet, type TextStyle } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../../test-mocks/react-native'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { buildHabitUnderstandingLabels } from '@orbit/shared/utils'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type MountedTitle = ReturnType<typeof renderer.create> & { toJSON: () => Parameters<typeof measureInteractionFills>[0] }
afterEach(__resetTestHostConfig)

it.each([360, 412].flatMap(width => [1, 2].map(scale => ({ width, scale }))))('aligns native title accessories with the first line at $width and scale $scale', ({ width, scale }) => {
  __setWindowDimensions({ width, height: 1600, scale: 1, fontScale: scale })
  const states = [
    { value: 'Read' }, { value: '' }, { value: 'Read', isEmojiSuggesting: true },
    { value: 'Read', error: 'Required', emojiSuggestionError: 'Try again' },
    { value: 'Read', emojiSuggestionHint: 'Enter a title' },
    { value: 'Read', isSuggestionDisabled: true }, { value: 'Read', proposed: true },
    { value: 'Read a long title with all its words visible every morning before work '.repeat(3) },
  ]
  let singleLineHeight = 0
  for (const state of states) {
    let tree!: MountedTitle
    void renderer.act(() => { tree = renderer.create(<HabitUnderstanding
      {...state} emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]} showSchedule={false}
      labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()}
      onToggleDay={vi.fn()} onQuantityChange={vi.fn()} onSuggestEmoji={vi.fn()} canSuggestEmoji />) as MountedTitle })
    try {
      const measured = measureProfileRow(tree.toJSON(), width - 32, scale)
      const title = tree.root.findAll(node => String(node.type) === 'Text' && (StyleSheet.flatten(node.props.style ?? {}) as TextStyle).color === 'transparent')[0]!
      const text = measured.texts.find(text => text.label.endsWith('\u200b'))!
      const titleStyle = StyleSheet.flatten(title.props.style) as TextStyle
      const height = Number(titleStyle.lineHeight) * scale
      const lines = [{
        text: text.label, x: 0, y: 0, width: text.width, height,
        descender: 0, capHeight: height, ascender: height, xHeight: height,
      }]
      if (typeof title.props.onTextLayout === 'function') void renderer.act(() => (title.props.onTextLayout as (event: { nativeEvent: { lines: typeof lines } }) => void)({ nativeEvent: { lines } }))
      const parts = measureInteractionFills(tree.toJSON(), width - 32, false, scale)
      const input = parts.find(part => part.host.type === 'TextInput')!
      const mirror = parts.find(part => part.host.type === 'Text' && (part.style as TextStyle).color === 'transparent')!
      const emoji = parts.find(part => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === 'habits.form.emojiOpenPicker')!
      const astra = parts.find(part => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === 'habits.form.suggestEmoji')!
      const paint = parts.find(part => part.host.props.testID === 'habit-emoji-well')!
      const firstLine = mirror.top + Number(mirror.style.paddingVertical) + Number((mirror.style as TextStyle).lineHeight) * scale / 2
      if (!singleLineHeight) singleLineHeight = input.height
      expect(Math.abs(emoji.height - singleLineHeight)).toBeLessThanOrEqual(1)
      expect(Math.abs(emoji.width - emoji.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(paint.height - emoji.height)).toBeLessThanOrEqual(1)
      for (const button of [emoji, astra]) expect(Math.abs(button.top + button.height / 2 - firstLine)).toBeLessThanOrEqual(1)
      if (state.value === 'Read') {
        expect(Math.abs(input.height - singleLineHeight)).toBeLessThanOrEqual(1)
        expect(Math.abs(input.top + input.height / 2 - firstLine)).toBeLessThanOrEqual(1)
      }
      if (state.value.length > 100) expect(input.height).toBeGreaterThan(singleLineHeight)
      expect(astra.right).toBeLessThanOrEqual(width - 32 + 1)
    } finally { void renderer.act(() => tree.update(<></>)) }
  }
})
