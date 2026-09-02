import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface OverlayGuard {
  name: string
  sourcePath: string
  mount: RegExp
  firstLine: string
}

const overlays: OverlayGuard[] = [
  {
    name: 'overflow menu',
    sourcePath: 'components/habits/habit-row-trailing.tsx',
    mount: /<Menu\b/,
    firstLine: "title={t('habits.actions.more')}",
  },
  {
    name: 'sub habit sheet',
    sourcePath: 'components/habits/create-habit-modal.tsx',
    mount: /<Sheet\b/,
    firstLine: "t('habits.createSubHabit')",
  },
  {
    name: 'move parent sheet',
    sourcePath: 'components/habits/habit-list/move-parent-overlay.tsx',
    mount: /<Sheet\b/,
    firstLine: "title={t('habits.moveParent.title')}",
  },
  {
    name: 'reschedule sheet',
    sourcePath: 'components/habits/reschedule-sheet.tsx',
    mount: /<Sheet\b/,
    firstLine: "title={t('habits.reschedule.title')}",
  },
  {
    name: 'delete confirmation',
    sourcePath: 'components/habits/habit-list/confirm-dialogs.tsx',
    mount: /<ConfirmSheet\b/,
    firstLine: "title={t('habits.deleteConfirmTitle')}",
  },
  {
    name: 'selection tray confirmation',
    sourcePath: 'app/(app)/today-page-view.tsx',
    mount: /<ConfirmSheet\b/,
    firstLine: "title={t('habits.bulkDeleteTitle')}",
  },
]

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('habit list overlay caller guards', () => {
  it.each(overlays)('$name mounts at its title without a nested scroller or skip confirmation', (overlay) => {
    const caller = source(overlay.sourcePath)
    const sheet = source('components/ui/sheet.tsx')
    const habitList = source('components/habits/habit-list.tsx')
    expect(caller).toMatch(overlay.mount)
    expect(caller).toContain(overlay.firstLine)
    expect(caller).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(sheet.indexOf('orbit-sheet-title')).toBeLessThan(sheet.indexOf('data-slot="sheet-body"'))
    expect(habitList).not.toContain('skipConfirmTitle')
    expect(habitList).toContain('await skipHabit.mutateAsync({ habitId, date })')
  })
})
