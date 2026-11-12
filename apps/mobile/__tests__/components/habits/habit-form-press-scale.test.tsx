import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, type ViewStyle } from 'react-native'
import { orbitalMotion } from '@orbit/shared/theme'
import { MotionPressable } from '@/components/ui/motion-pressable'

const HABITS = resolve('components/habits')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = join(directory, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return file.endsWith('.tsx') ? [file] : []
  })
}

/** Every habit file that renders `MotionPressable`, which appends its own scale after the caller's style. */
const MOTION_PRESSABLE_CALLERS = sourceFiles(HABITS)
  .filter((file) => readFileSync(file, 'utf8').includes("from '@/components/ui/motion-pressable'"))
  .map((file) => relative(HABITS, file))

describe('habit form press scale on mobile', () => {
  it('finds the habit form MotionPressable callers', () => {
    expect(MOTION_PRESSABLE_CALLERS).toEqual(expect.arrayContaining([
      'checklist-templates.tsx',
      'create-habit-modal/sub-habit-editor.tsx',
      'habit-form-fields/habit-emoji-selector.tsx',
      'habit-form-fields/habit-understanding.tsx',
      'habit-form-fields/reminder-section.tsx',
      'habit-form-fields/scheduled-reminder-section.tsx',
      'habit-form-fields/tag-editor-row.tsx',
      'habit-form-fields/tag-picker-field.tsx',
    ]))
  })

  it.each(MOTION_PRESSABLE_CALLERS)('%s leaves the press scale to MotionPressable', (path) => {
    expect(readFileSync(join(HABITS, path), 'utf8').match(/transform:\s*\[\s*\{\s*scale[^\]]*\]/g) ?? []).toEqual([])
  })

  it('renders the token press scale whatever scale a caller style declares, so a caller transform never shows', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<MotionPressable accessibilityLabel="Preset" style={({ pressed }) => (pressed ? { transform: [{ scale: 0.98 }] } : null)} onPress={vi.fn()} />) })
    const host = () => tree.root.findAll((node) => typeof node.type === 'string')[0]!
    const scale = () => (StyleSheet.flatten(host().props.style) as ViewStyle).transform
    expect(scale()).toEqual([{ scale: 1 }])
    await act(() => { (host().props.onPressIn as () => void)() })
    expect(scale()).toEqual([{ scale: orbitalMotion.press.scale }])
    await act(() => { (host().props.onPressOut as () => void)() })
    expect(scale()).toEqual([{ scale: 1 }])
    await act(() => tree.update(<></>))
  })
})
