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
  'components/ui/date-field.tsx',
  'components/ui/year-picker.tsx',
  'components/ui/field-trigger.tsx',
  'components/ui/select.tsx',
  'components/ui/time-field.tsx',
  'components/habits/habit-form-fields/scheduled-reminder-section.tsx',
  'components/habits/habit-form-fields/tag-picker-field.tsx',
  'components/shell/shell-wide.tsx',
  'components/shell/sidebar-account.tsx',
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
/** Tailwind 4 `active:scale-[0.96]` sets the CSS `scale` property, so a rule whose consumers press with it transitions `scale`. */
const SCALE_PRESS = 'scale var(--dur-press) var(--ease-out)'
const COLOR_HOVER = 'background-color var(--dur-hover-control) var(--ease-standard), color var(--dur-hover-control) var(--ease-standard)'
const COLOR_AND_SCALE_PRESS = `${COLOR_HOVER}, ${SCALE_PRESS}`

const STYLESHEET_TRANSITIONS = [
  ['.orbit-list-row', 'background-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard), transform var(--dur-press) var(--ease-out)'],
  ['.orbit-list-row-body', `background-color var(--dur-hover) var(--ease-standard), ${SCALE_PRESS}`],
  ['.orbit-list-row-action', `background-color var(--dur-hover-control) var(--ease-standard), ${SCALE_PRESS}`],
  ['.habit-control-motion', `background-color var(--dur-hover-control) var(--ease-standard), color var(--dur-hover-control) var(--ease-standard), ${SCALE_PRESS}`],
  /** The close presses its glyph, so the control transitions its colours only. */
  ['.orbit-sheet-close', COLOR_HOVER],
  ['.icon-btn', COLOR_AND_PRESS],
  ['.chip', COLOR_AND_SCALE_PRESS],
  ['.habit-form-disclosure', 'opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out)'],
] as const

/** Every quoted, single-quoted or template class string in a source file, with the attribute that receives it. */
function classLiterals(text: string) {
  return Array.from(text.matchAll(/(controlClassName=)?(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)/g), (match) => ({ attribute: match[1], literal: match[2] ?? match[3] ?? match[4] ?? '' }))
}

const HOVER_FILL = /(?<![\w/-])(?:enabled:)?hover:bg-\[(var\(--[a-z-]+\))\]/g
const PRESS_FILL_FOR: Record<string, string> = { 'var(--primary-hover)': 'var(--primary-pressed)' }

/** A hover fill without the matching press fill in the same class string: a touch press, which never hovers, would paint nothing. */
function hoverFillsWithoutPress(text: string) {
  return classLiterals(text)
    .filter(({ attribute }) => attribute === undefined)
    .flatMap(({ literal }) => Array.from(literal.matchAll(HOVER_FILL), (match) => {
      const press = (PRESS_FILL_FOR[match[1]!] ?? match[1]!).replace(/[()[\]-]/g, String.raw`\$&`)
      return new RegExp(String.raw`(?<![\w/-])(?:enabled:)?active:bg-\[${press}\]`).test(literal) ? [] : [`${match[0]} in ${literal.slice(0, 80)}`]
    }).flat())
}

const PRESS_FILL_FILES = [
  ...HABIT_FILES,
  'components/habits/habit-form-fields/habit-month-days-field.tsx',
  'components/habits/habit-form-fields/habit-understanding.tsx',
  'components/habits/habit-form-fields/tag-suggestions.tsx',
  'components/habits/goal-linking-field.tsx',
  'components/ui/weekday-picker.tsx',
  'components/onboarding/onboarding-create-habit.tsx',
] as const

const PICKER_ROW_CALLERS = [
  'components/habits/habit-form-fields/tag-picker-field.tsx',
  'components/habits/habit-form-fields/tag-suggestions.tsx',
  'components/habits/goal-linking-field.tsx',
  'components/goals/goal-habits-field.tsx',
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
    expect(source(HABIT_FILES[0])).toContain('duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-enabled/remove:group-hover/remove')
  })

  it('times checklist presses with the press token and hovers with the control token', () => {
    const text = source('components/habits/habit-checklist.tsx')
    expect(occurrences(text, '[transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-press)] [transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-out)]')).toBe(1)
    expect(occurrences(text, '[transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-hover-control),var(--dur-press)] [transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-standard),var(--ease-out)]')).toBe(2)
    expect(text).toContain('transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-enabled/remove:group-hover/remove:text-[var(--status-bad)]')
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
    expect(occurrences(text, 'transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover/remove:text-[var(--status-bad)]')).toBe(1)
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

  it('presses the date trigger on the press token and shows its focus ring at once', () => {
    const text = source('components/ui/date-field.tsx')
    expect(occurrences(text, 'transition-[scale] duration-[var(--dur-press)] ease-[var(--ease-out)] motion-safe:enabled:active:scale-[0.96]')).toBe(1)
    expect(text).not.toMatch(/transition-\[[^\]]*box-shadow/)
  })

  it.each([
    ['components/ui/date-field.tsx', 'day'],
    ['components/ui/year-picker.tsx', 'year'],
  ])('%s eases the %s press scale beside its hover fill', (path) => {
    const text = source(path)
    expect(occurrences(text, 'transition-[background-color,scale] duration-[var(--dur-hover-control),var(--dur-press)] ease-[var(--ease-standard),var(--ease-out)] motion-safe:active:scale-[0.96]')).toBe(1)
    expect(text).not.toMatch(/transition-\[[^\]]*transform/)
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

  it.each([
    ['components/habits/habit-form-fields/habit-understanding.tsx', '.habit-control-motion'],
    ['components/ui/list-row.tsx', '.orbit-list-row-action'],
  ])('%s eases its scale press through %s', (path, rule) => {
    expect(source(path)).toMatch(new RegExp(String.raw`${rule.slice(1)}[^"'\`]*active:scale-\[0\.96\]`))
    expect(stylesheetTransition(source('app/globals.css'), rule)).toContain(SCALE_PRESS)
  })

  it.each(PRESS_FILL_FILES)('%s gives every hover fill the matching press fill, so a touch press paints it', (path) => {
    expect(hoverFillsWithoutPress(source(path))).toEqual([])
  })

  it.each([
    ['components/habits/habit-form-fields/reminder-section.tsx', 3],
    ['components/habits/habit-form-fields/scheduled-reminder-section.tsx', 1],
    ['components/habits/create-habit-modal/sub-habit-editor.tsx', 1],
  ] as const)('%s presses its remove, preset and custom buttons with the eased scale its mobile mirror uses', (path, count) => {
    const text = source(path)
    expect(text).not.toContain('transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"')
    expect(text.match(/className=[{"`]+habit-control-motion [^"`]*active:scale-\[0\.96\]/g)).toHaveLength(count)
  })

  it('presses the checklist template rows, close and save with the scale and fill their mobile mirrors use', () => {
    const text = source('components/habits/checklist-templates.tsx')
    expect(text).toMatch(/orbit-list-row-body [^"]*active:scale-\[0\.96\]/)
    expect(text).toMatch(/orbit-list-row-action [^"]*active:scale-\[0\.96\]/)
    expect(text).toContain('enabled:hover:bg-[var(--primary-hover)] enabled:active:bg-[var(--primary-pressed)] enabled:active:scale-[0.96]')
    expect(text).toContain('enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] enabled:active:bg-[var(--bg-hover)] enabled:active:scale-[0.96]')
  })

  it('fills the time field picker and clear buttons on hover and press with the neutral hover role and eases their scale', () => {
    const text = source('components/ui/time-field.tsx')
    expect(text).not.toContain('--bg-sunk')
    expect(occurrences(text, 'enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] motion-safe:enabled:active:scale-[0.96]')).toBe(2)
    expect(occurrences(text, ' hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:')).toBe(0)
    expect(occurrences(text, 'transition-[background-color,scale] duration-[var(--dur-hover-control),var(--dur-press)] ease-[var(--ease-standard),var(--ease-out)]')).toBe(2)
  })

  it.each([
    'components/habits/habit-form-fields/habit-emoji-selector.tsx',
    'components/ui/picker-list.tsx',
    'app/(app)/preferences/_components/preference-picker-sheet.tsx',
  ])('%s gives its shared form input search the text field hover', (path) => {
    expect(source(path)).toMatch(/className="form-input orbit-field-hover/)
  })

  it('rings the shared form input with the control border and shows its focus ring at once', () => {
    const rule = /^\.form-input \{([^}]*)\}/m.exec(source('app/globals.css'))?.[1]
    expect(rule).toContain('box-shadow: inset 0 0 0 1px var(--border-control);')
    expect(rule).not.toMatch(/transition|duration-|--hairline/)
  })

  it('lets the picker row own its press scale, eased through the list row body rule, so no caller repeats it', () => {
    expect(source('components/ui/picker-row.tsx')).toContain('orbit-list-row-body group/picker enabled:active:scale-[0.96]')
    for (const path of PICKER_ROW_CALLERS) expect(source(path)).not.toMatch(/controlClassName="[^"]*scale-/)
    expect(stylesheetTransition(source('app/globals.css'), '.orbit-list-row-body')).toContain(SCALE_PRESS)
  })
})
