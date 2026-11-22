import React, { useState } from 'react'
import { StyleSheet, type TextStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { buildHabitUnderstandingLabels, readHabitPhrase, segmentHabitPhrase } from '@orbit/shared/utils'
import { TypedTextInput } from '@/components/ui/typed-text-input'
import { AppTextInput } from '@/components/ui/app-text-input'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { Input } from '@/components/ui/input'
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

function Field({ kind, multiline }: Readonly<{ kind: string; multiline: boolean }>) {
  const [value, setValue] = useState('')
  if (kind === 'Input') return multiline ? <Input label="Name" value={value} onChange={setValue} multiline /> : <Input label="Name" value={value} onChange={setValue} />
  const Primitive = kind === 'TypedTextInput' ? TypedTextInput : kind === 'AppTextInput' ? AppTextInput : BottomSheetAppTextInput
  return <Primitive accessibilityLabel="Name" value={value} onChangeText={setValue} multiline={multiline} onFocus={vi.fn()} onBlur={vi.fn()} style={{ color: 'transparent', paddingHorizontal: 8 }} />
}
