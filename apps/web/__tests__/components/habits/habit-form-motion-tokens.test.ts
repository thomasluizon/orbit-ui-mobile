import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

const HABIT_FILES = [
  'components/habits/habit-form-fields/habit-emoji-selector.tsx',
  'components/habits/habit-form-fields/reminder-section.tsx',
  'components/habits/habit-form-fields/tag-editor-row.tsx',
  'components/habits/habit-checklist.tsx',
  'components/habits/checklist-templates.tsx',
  'components/habits/create-habit-modal/sub-habit-editor.tsx',
  'components/habits/description-copy-button.tsx',
  'components/ui/select-check.tsx',
] as const

describe('habit form and frequency picker motion tokens', () => {
  it.each(HABIT_FILES)('%s carries no literal hover or press duration', (path) => {
    const text = source(path)
    expect(text).not.toMatch(/duration-\[\d+ms\]/)
    expect(text).not.toMatch(/duration-\d+\b/)
    expect(text).not.toMatch(/,\s*\d+ms\]/)
    expect(text).not.toMatch(/\[transition-duration:[^\]]*\b\d+ms/)
  })

  it.each(HABIT_FILES)('%s uses no movement duration for a hover', (path) => {
    expect(source(path)).not.toContain('--dur-fast')
  })

  it('times the emoji remove glyph hover as a control hover', () => {
    expect(source(HABIT_FILES[0])).toContain('duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover/remove')
  })

  it('times checklist presses with the press token and hovers with the control token', () => {
    const text = source('components/habits/habit-checklist.tsx')
    expect(text.match(/var\(--dur-hover-control\),var\(--dur-hover-control\),var\(--dur-press\)\]/g)).toHaveLength(3)
    expect(text.match(/var\(--dur-hover-control\),var\(--dur-hover-control\),var\(--dur-hover-control\),var\(--dur-press\)\]/g)).toHaveLength(2)
    expect(text).toContain('transition-colors duration-[var(--dur-hover-control)] group-hover/remove:text-[var(--status-bad)]')
  })

  it('times the sub-habit remove control hover as a control hover', () => {
    const text = source('components/habits/create-habit-modal/sub-habit-editor.tsx')
    expect(text.match(/duration-\[var\(--dur-hover-control\)\]/g)).toHaveLength(2)
  })

  it.each([
    'components/habits/create-habit-modal/sub-habit-editor.tsx',
    'components/habits/habit-form-fields/reminder-section.tsx',
    'components/habits/habit-form-fields/tag-editor-row.tsx',
    'components/habits/checklist-templates.tsx',
  ])('%s fields share the text field hover transition', (path) => {
    const text = source(path)
    expect(text).toContain('orbit-field-hover')
    expect(text).not.toMatch(/transition-\[box-shadow\]/)
    expect(text).toContain('shadow-[inset_0_0_0_1px_var(--border-control)]')
  })

  it('times the frequency picker row press with the press token', () => {
    const text = source('components/ui/select-check.tsx')
    expect(text).toContain('duration-[var(--dur-hover),var(--dur-press)]')
    expect(text).toContain('transition-[scale] duration-[var(--dur-press)]')
  })

  it('lets the copy button inherit the shared icon button timing', () => {
    const text = source('components/habits/description-copy-button.tsx')
    expect(text).toContain('icon-btn icon-btn-well')
    expect(text).not.toMatch(/\btransition-\[|\[transition-duration:|\bease-\[/)
  })

  it('names the hover and press tokens in the shared stylesheet', () => {
    const css = source('app/globals.css')
    expect(css).not.toMatch(/transform 150ms/)
    expect(css).not.toMatch(/(?:background-color|color|box-shadow) (?:240|380)ms/)
    expect(css).toMatch(/\.habit-control-motion \{\s*transition: background-color var\(--dur-hover-control\) var\(--ease-standard\), color var\(--dur-hover-control\) var\(--ease-standard\), transform var\(--dur-press\) var\(--ease-out\);/)
    expect(css).toMatch(/\.icon-btn \{[^}]*transition:\s*background-color var\(--dur-hover-control\) var\(--ease-standard\),\s*color var\(--dur-hover-control\) var\(--ease-standard\),\s*transform var\(--dur-press\) var\(--ease-out\);/)
    expect(css).toMatch(/\.habit-form-disclosure \{[^}]*transition: opacity var\(--dur-enter\) var\(--ease-out\), transform var\(--dur-enter\) var\(--ease-out\);/s)
  })
})
