import { readFileSync } from 'node:fs'
import postcss, { type Rule } from 'postcss'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { classNamesIn, compileClassRules, type CompiledClassRules } from '@/__tests__/support/compiled-class-rules'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en-US' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/components/ui/sheet', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/ui/sheet')>(),
  Sheet: ({ children, headerAccessory }: { children: ReactNode; headerAccessory?: ReactNode }) => <div role="dialog">{headerAccessory}{children}</div>,
}))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [] }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))

import { MAX_CHECKLIST_ITEMS } from '@orbit/shared/validation'
import { PickerRow } from '@/components/ui/picker-row'
import { TimeField } from '@/components/ui/time-field'
import { ChecklistTemplates } from '@/components/habits/checklist-templates'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'

const translate = ((key: string) => key) as unknown as Parameters<typeof ReminderSection>[0]['t']
const tag = { id: 'tag-0', name: 'Health', color: '#6d5bd0' }

/** Each scenario renders habit form press controls in their disabled state and returns them. */
const DISABLED_PRESS_CONTROLS: ReadonlyArray<readonly [string, () => HTMLElement[]]> = [
  ['a picker row whose caller passes no press scale', () => {
    render(<PickerRow name="Reading" selected={false} disabled onToggle={vi.fn()} value="" valueClassName="flex-1" controlClassName="orbit-list-row-body flex min-h-12 w-full items-center rounded-[12px] px-2 py-1 text-left disabled:opacity-40" actionsClassName="flex" />)
    return [screen.getByRole('button', { name: 'Reading' })]
  }],
  ['the tag picker row, edit and delete', () => {
    const props = { tags: [tag], selectedIds: [], atLimit: false, onToggle: vi.fn(), onCreate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), editLabel: 'Edit', deleteLabel: 'Delete' }
    const view = render(<TagPickerField {...props} disabled={false} />)
    fireEvent.click(screen.getByText('habits.form.tags'))
    view.rerender(<TagPickerField {...props} disabled />)
    return [screen.getByRole('button', { name: 'Health' }), screen.getByRole('button', { name: 'Edit: Health' }), screen.getByRole('button', { name: 'Delete: Health' })]
  }],
  ['the last reminder remove', () => {
    render(<ReminderSection reminderEnabled reminderTimes={[15]} onReminderTimesChange={vi.fn()} reminderLabel={(minutes) => `${minutes} min`} t={translate} />)
    return [screen.getByRole('button', { name: 'habits.form.removeReminder' })]
  }],
  ['the checklist template save', () => {
    render(<ChecklistTemplates items={[{ text: 'Run', isChecked: false }]} onLoad={vi.fn()} />)
    fireEvent.click(screen.getByText('habits.form.useTemplate'))
    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    return [screen.getByRole('button', { name: 'common.save' })]
  }],
  ['the tag editor save and cancel', () => {
    render(<TagEditorRow value="Health" inputAriaLabel="Tag name" actionLabel="Save tag" cancelAriaLabel="Cancel tag" disabled onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} />)
    return [screen.getByRole('button', { name: 'Save tag' }), screen.getByRole('button', { name: 'Cancel tag' })]
  }],
  ['the emoji trigger and remove', () => {
    const view = render(<HabitEmojiSelector selectedEmoji="🏃" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    view.rerender(<HabitEmojiSelector selectedEmoji="🏃" onSelect={vi.fn()} isDisabled />)
    return [screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }), screen.getByRole('button', { name: 'habits.form.emojiRemove' })]
  }],
  ['the checklist duplicate at the item limit', () => {
    render(<HabitChecklist editable items={Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, index) => ({ text: `Step ${index}`, isChecked: false }))} onItemsChange={vi.fn()} />)
    return [screen.getAllByRole('button', { name: 'habits.form.duplicateChecklistItem' })[0]!]
  }],
  ['the time field picker button', () => {
    render(<TimeField label="Start" value="" onChange={vi.fn()} disabled />)
    return [screen.getByRole('button', { name: /^Start: / })]
  }],
]

/** Properties a hover or a press paints: the fill and the content colour. */
const INTERACTION_PAINT = ['background-color', 'background', 'color']

/** The global press rule `app/globals.css` declares under reduced motion: its selector and whether it can beat a layered utility. */
function reducedMotionPressRules() {
  const found: Array<{ selector: string; important: boolean; unlayered: boolean }> = []
  postcss.parse(readFileSync('app/globals.css', 'utf8')).walkAtRules('media', (media) => {
    if (media.params !== '(prefers-reduced-motion: reduce)') return
    media.walkDecls('scale', (declaration) => {
      if (declaration.value !== 'none' || declaration.parent?.type !== 'rule') return
      found.push({ selector: (declaration.parent as Rule).selector, important: Boolean(declaration.important), unlayered: media.parent?.type === 'root' })
    })
  })
  return found
}

describe('habit form press scale', () => {
  let rules: CompiledClassRules

  beforeAll(async () => {
    const names = DISABLED_PRESS_CONTROLS.flatMap(([, renderControls]) => {
      renderControls()
      const scenarioNames = classNamesIn(document)
      cleanup()
      return scenarioNames
    })
    rules = await compileClassRules(names)
  }, 60_000)

  function pressScaleRules(control: Element) {
    return rules.rulesFor(control).filter((rule) => rule.declarations.has('scale') && rule.state.includes(':active'))
  }

  it.each(DISABLED_PRESS_CONTROLS)('scales %s on press only while enabled, as the mobile press scale does', (_, renderControls) => {
    const controls = renderControls()
    for (const control of controls) {
      expect(control).toBeDisabled()
      expect(pressScaleRules(control).map((rule) => rule.declarations.get('scale'))).toEqual(['0.96'])
      expect(pressScaleRules(control).map((rule) => rule.state)).toEqual([':enabled:active'])
    }
  })

  it.each(DISABLED_PRESS_CONTROLS)('paints no hover or press state on %s while disabled, as its mobile mirror does', (_, renderControls) => {
    for (const control of renderControls()) {
      expect(control).toBeDisabled()
      const interactionPaints = rules.rulesFor(control).filter((rule) => /:hover|:active/.test(rule.state) && INTERACTION_PAINT.some((property) => rule.declarations.has(property)))
      expect(interactionPaints.filter((rule) => !/:enabled|:not\(:disabled\)/.test(rule.state)).map((rule) => rule.state)).toEqual([])
    }
  })

  it.each(DISABLED_PRESS_CONTROLS)('holds %s at unit scale under reduced motion through the global press rule', (_, renderControls) => {
    const [press] = reducedMotionPressRules()
    expect(reducedMotionPressRules()).toHaveLength(1)
    expect(press).toMatchObject({ important: true, unlayered: true })
    for (const control of renderControls()) {
      expect(control.matches(press!.selector.replace(/:active$/, ''))).toBe(true)
      expect([...control.classList].filter((name) => name.includes('scale-') && name.includes('!'))).toEqual([])
    }
  })
})
