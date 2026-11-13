import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const sources = ['app', 'components', 'hooks', 'lib'].flatMap((directory) => sourceFiles(join(root, directory)))
  .map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }))

/** The only files that may write a press scale: the shared press primitives and the list row body, which eases it on the same transition. */
const PRESS_SCALE_OWNERS = ['components/ui/motion-pressable.tsx', 'components/motion/press-scale.tsx', 'components/ui/list-row.tsx']

const PRESS_SCALE_WRITE = /scale:[^,}\]]*\b0\.9[69]\b|orbitalMotion\.press\.scale|pressedScale|PressedScale/

/**
 * Every press control that the press gap list of thomasluizon/orbit-tickets#2096 names, on mobile. Each reaches the shared press transition
 * through `MotionPressable`, `PressScale`, `PressScalePressable` or the list row transition.
 */
const LISTED_PRESS_CONTROLS = [
  'components/ui/status-dot.tsx',
  'components/ui/year-picker.tsx',
  'components/ui/select-check.tsx',
  'components/ui/picker-row.tsx',
  'components/ui/chip.tsx',
  'components/ui/date-field.tsx',
  'components/ui/time-field.tsx',
  'components/ui/sheet.tsx',
  'components/ui/list-row.tsx',
  'app/step-up.tsx',
  'components/upgrade/pricing-section.tsx',
  'app/(tabs)/calendar/_components/calendar-time-grid.tsx',
  'components/chat/answer-block.tsx',
  'components/gamification/streak-badge.tsx',
  'components/habits/habit-row-check-circle.tsx',
  'components/habits/habit-row-trailing.tsx',
  'components/habits/habit-row.tsx',
  'components/habits/habit-checklist.tsx',
  'components/habits/selection-tray.tsx',
  'components/habit-list/habit-drill.tsx',
  'components/habits/checklist-templates.tsx',
  'components/habits/habit-form-fields/reminder-section.tsx',
  'components/habits/habit-form-fields/scheduled-reminder-section.tsx',
  'components/habits/create-habit-modal/sub-habit-editor.tsx',
  'components/onboarding/onboarding-create-habit.tsx',
  'components/goals/goal-detail-sections.tsx',
  'components/goals/edit-goal-modal/edit-goal-deadline-field.tsx',
  'components/habits/create-goal-from-habit/goal-deadline-field.tsx',
  'components/shell/composer.tsx',
  'components/message-bubble.tsx',
  'components/referral/referral-drawer.tsx',
]

const PRESS_PRIMITIVE_IMPORT = /from ['"]@\/components\/(?:ui\/motion-pressable|motion\/press-scale)['"]/

describe('mobile press scale primitives', () => {
  it('writes a press scale only in the shared press primitives, so no control snaps without the press transition', () => {
    const writers = sources.filter(({ path, text }) => !PRESS_SCALE_OWNERS.includes(path) && PRESS_SCALE_WRITE.test(text)).map(({ path }) => path)
    expect(writers).toEqual([])
  })

  it.each(LISTED_PRESS_CONTROLS)('%s keeps its press on a shared press primitive', (path) => {
    const source = sources.find((candidate) => candidate.path === path)
    expect(source, `${path} exists`).toBeDefined()
    expect(PRESS_PRIMITIVE_IMPORT.test(source!.text)).toBe(true)
  })
})
