import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

function occurrences(text: string, needle: string) {
  return text.split(needle).length - 1
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

const DURATION_TOKENS = String.raw`var\(--dur-[a-z-]+\)(?:,var\(--dur-[a-z-]+\))*`
const CURVE_TOKENS = String.raw`var\(--ease-[a-z-]+\)(?:,var\(--ease-[a-z-]+\))*`
const TIMED_TRANSITION = new RegExp(String.raw`duration-\[(${DURATION_TOKENS})\] ease-\[(${CURVE_TOKENS})\]|\[transition-duration:(${DURATION_TOKENS})\] \[transition-timing-function:(${CURVE_TOKENS})\]`, 'g')
const TRANSITION_UTILITY = /(?<![\w[-])transition-(?!none\b)[^\s"'`]+/g
const UNTIMED_MOTION = /(?<![\w-])(?:duration|ease)-|\[transition-(?:duration|timing-function):|cubic-bezier\(|\d+ms\b/

function timedTransitions(text: string) {
  return Array.from(text.matchAll(TIMED_TRANSITION), (match) => ({
    durations: (match[1] ?? match[3])!.split(','),
    curves: (match[2] ?? match[4])!.split(','),
  }))
}

function stylesheetTransition(css: string, selector: string) {
  const block = new RegExp(String.raw`^${selector.replaceAll('.', String.raw`\.`)} \{([^}]*)\}`, 'm').exec(css)?.[1]
  return block?.match(/transition:\s*([^;]+);/)?.[1]?.replace(/\s+/g, ' ')
}

const COLOR_AND_PRESS = 'background-color var(--dur-hover-control) var(--ease-standard), color var(--dur-hover-control) var(--ease-standard), transform var(--dur-press) var(--ease-out)'

const STYLESHEET_TRANSITIONS = [
  ['.orbit-list-row', 'background-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard), transform var(--dur-press) var(--ease-out)'],
  ['.orbit-list-row-action', 'background-color var(--dur-hover-control) var(--ease-standard), transform var(--dur-press) var(--ease-out)'],
  ['.habit-control-motion', COLOR_AND_PRESS],
  ['.orbit-sheet-close', COLOR_AND_PRESS],
  ['.icon-btn', COLOR_AND_PRESS],
  ['.chip', COLOR_AND_PRESS],
  ['.habit-form-disclosure', 'opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out)'],
] as const

describe('habit form and frequency picker motion tokens', () => {
  it.each(HABIT_FILES)('%s times every transition with a duration token and a curve token', (path) => {
    const text = source(path)
    const timed = timedTransitions(text)
    expect(timed).toHaveLength(text.match(TRANSITION_UTILITY)?.length ?? 0)
    for (const { durations, curves } of timed) expect(curves).toHaveLength(durations.length)
    expect(text.replace(TIMED_TRANSITION, '')).not.toMatch(UNTIMED_MOTION)
  })

  it.each(HABIT_FILES)('%s uses no movement duration for a hover', (path) => {
    expect(source(path)).not.toContain('--dur-fast')
  })

  it('times the emoji remove glyph hover as a control hover', () => {
    expect(source(HABIT_FILES[0])).toContain('duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover/remove')
  })

  it('times checklist presses with the press token and hovers with the control token', () => {
    const text = source('components/habits/habit-checklist.tsx')
    expect(occurrences(text, '[transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-press)] [transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-out)]')).toBe(1)
    expect(occurrences(text, '[transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-hover-control),var(--dur-press)] [transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-standard),var(--ease-out)]')).toBe(2)
    expect(text).toContain('transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover/remove:text-[var(--status-bad)]')
  })

  it('shows the checklist row actions at once on keyboard focus', () => {
    const revealed = source('components/habits/habit-checklist.tsx')
      .split('\n')
      .filter((line) => line.includes('focus-visible:opacity-100'))
    expect(revealed).toHaveLength(2)
    for (const line of revealed) expect(line).toContain('focus-visible:transition-none')
  })

  it('times the sub-habit remove control hover as a control hover', () => {
    const text = source('components/habits/create-habit-modal/sub-habit-editor.tsx')
    expect(occurrences(text, 'transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]')).toBe(2)
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
    expect(text).toContain('transition-[background-color,scale] duration-[var(--dur-hover),var(--dur-press)] ease-[var(--ease-standard),var(--ease-out)]')
    expect(text).toContain('transition-[scale] duration-[var(--dur-press)] ease-[var(--ease-out)]')
  })

  it('lets the copy button inherit the shared icon button timing', () => {
    const text = source('components/habits/description-copy-button.tsx')
    expect(text).toContain('icon-btn icon-btn-well')
    expect(text).not.toMatch(/\btransition-\[|\[transition-duration:|\bease-\[/)
  })

  it('carries no literal hover or press duration in the shared stylesheet', () => {
    const css = source('app/globals.css')
    expect(css).not.toMatch(/transform 150ms/)
    expect(css).not.toMatch(/(?:background-color|color|box-shadow) (?:240|380)ms/)
  })

  it.each(STYLESHEET_TRANSITIONS)('%s names its duration and curve tokens in the shared stylesheet', (selector, transition) => {
    expect(stylesheetTransition(source('app/globals.css'), selector)).toBe(transition)
  })
})
