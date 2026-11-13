import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import postcss, { type Rule } from 'postcss'
import ts from 'typescript'
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
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { TimeField } from '@/components/ui/time-field'
import { ChecklistTemplates } from '@/components/habits/checklist-templates'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'

const translate = ((key: string) => key) as unknown as Parameters<typeof ReminderSection>[0]['t']
const tag = { id: 'tag-0', name: 'Health', color: '#6d5bd0' }

/** The edit modal disables its habit form fields through `<fieldset disabled>` while it saves (`edit-habit-modal.tsx`). */
function InFieldset({ disabled, children }: Readonly<{ disabled: boolean; children: ReactNode }>) {
  return <fieldset disabled={disabled}>{children}</fieldset>
}

/** A tag suggestion row (`tag-suggestions.tsx`): proposed, and disabled at the tag limit or while a suggestion saves. */
function ProposedPickerRow({ disabled }: Readonly<{ disabled: boolean }>) {
  return <PickerRow proposed name="Reading" selected={false} disabled={disabled} onToggle={vi.fn()} value="" valueClassName="flex-1" controlClassName="orbit-list-row-body flex min-h-12 w-full items-center rounded-[12px] px-2 py-1 text-left disabled:opacity-40" actionsClassName="flex" />
}

/** The habit form's radio rows (`habit-type-field.tsx`, `habit-date-field.tsx`): a plain row, a personal row, and a disabled personal row with its reason disclosure. */
function FormRadioRows() {
  return <RadioGroup aria-label="Type">
    <RadioRow label="Task" selected onSelect={vi.fn()} />
    <RadioRow label="Habit" textMode="personal" onSelect={vi.fn()} />
    <RadioRow label="Locked" textMode="personal" disabled reason="Locked by the parent" />
  </RadioGroup>
}

/** A plain and a personal radio row, idle or busy. A busy row stays enabled for focus and is `aria-disabled`, so `:enabled` does not gate it. */
function RadioRowsWhile({ busy }: Readonly<{ busy: boolean }>) {
  const state = busy ? { busy: true as const, reason: 'Saving' } : { busy: false as const }
  return <RadioGroup aria-label="Type">
    <RadioRow label="Task" onSelect={vi.fn()} {...state} />
    <RadioRow label="Habit" textMode="personal" onSelect={vi.fn()} {...state} />
  </RadioGroup>
}

/** Each scenario renders habit form press controls in their disabled state and returns them. */
const DISABLED_PRESS_CONTROLS: ReadonlyArray<readonly [string, () => HTMLElement[]]> = [
  ['a proposed picker row whose caller passes no press scale', () => {
    render(<ProposedPickerRow disabled />)
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
  ['the exact time clear inside the disabled timing fieldset', () => {
    render(<InFieldset disabled><TimeField label="Start" value="09:00" onChange={vi.fn()} onClear={vi.fn()} /></InFieldset>)
    return [screen.getByRole('button', { name: 'common.clear' })]
  }],
  ['the scheduled reminder remove inside a disabled fieldset', () => {
    render(<InFieldset disabled><ScheduledReminderSection reminderEnabled scheduledReminders={[{ when: 'same_day', time: '09:00' }]} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} t={translate} /></InFieldset>)
    return [screen.getByRole('button', { name: 'habits.form.removeScheduledReminder' })]
  }],
  ['the reminder remove, preset and custom rows inside a disabled fieldset', () => {
    const section = <ReminderSection reminderEnabled reminderTimes={[15, 30]} onReminderTimesChange={vi.fn()} reminderLabel={(minutes) => `${minutes} min`} t={translate} />
    const view = render(<InFieldset disabled={false}>{section}</InFieldset>)
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.reminderAdd/ }))
    view.rerender(<InFieldset disabled>{section}</InFieldset>)
    return [screen.getAllByRole('button', { name: 'habits.form.removeReminder' })[0]!, screen.getByRole('button', { name: 'habits.form.reminderAtTime' }), screen.getByRole('button', { name: 'habits.form.reminderCustom' })]
  }],
  ['the radio row inside a disabled fieldset', () => {
    render(<InFieldset disabled><FormRadioRows /></InFieldset>)
    return [screen.getByRole('radio', { name: 'Task' })]
  }],
  ['the checklist item remove inside a disabled fieldset', () => {
    render(<InFieldset disabled><HabitChecklist editable items={[{ text: 'Run', isChecked: false }]} onItemsChange={vi.fn()} /></InFieldset>)
    return [screen.getByRole('button', { name: 'habits.form.removeChecklistItem' })]
  }],
]

const HABITS = 'components/habits'
/** Files `HabitFormFields` renders inside the edit modal's `<fieldset disabled>`, so a fieldset can disable any of their controls. */
const FIELDSET_FILES = ['habit-form-fields/', 'checklist-templates.tsx', 'habit-checklist.tsx', 'goal-linking-field.tsx']
const FORM_CONTROLS = new Set(['button', 'input', 'select', 'textarea'])
/** A hover or press variant that paints a fill or a text colour, or scales. */
const INTERACTION_TOKEN = /^(?<chain>(?:[\w-]+(?:\/[\w-]+)?:)*?)(?<group>group-)?(?<state>hover|active)(?:\/(?<name>[\w-]+))?:(?:[\w-]+:)*(?:bg|text|scale)-/

function habitSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = join(directory, name)
    if (statSync(file).isDirectory()) return habitSourceFiles(file)
    return file.endsWith('.tsx') ? [file] : []
  })
}

/** Class tokens of a `className` value. A token in the false branch of a `disabled ? … : …` condition is gated by that condition. */
function classTokens(node: ts.Node, source: ts.SourceFile, gated = false): Array<{ token: string; gated: boolean }> {
  if (ts.isConditionalExpression(node) && /\b(?:is)?[dD]isabled\b/.test(node.condition.getText(source))) {
    return [...classTokens(node.whenTrue, source, gated), ...classTokens(node.whenFalse, source, true)]
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return node.text.split(/\s+/).filter(Boolean).map((token) => ({ token, gated }))
  }
  return node.getChildren(source).flatMap((child) => classTokens(child, source, gated))
}

interface ClassAttribute { at: string; inFieldset: boolean; disableable: boolean; tokens: Array<{ token: string; gated: boolean }> }

/** Every `className` in a habit file, with whether its element is a form control that can be disabled, directly or by the form fieldset. */
function classAttributes(file: string): ClassAttribute[] {
  const path = relative(HABITS, file)
  const inFieldset = FIELDSET_FILES.some((prefix) => path.startsWith(prefix))
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const attributes: ClassAttribute[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className' && node.initializer && ts.isJsxOpeningLikeElement(node.parent.parent)) {
      const element = node.parent.parent
      const ownDisabled = element.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'disabled')
      attributes.push({
        at: `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`,
        inFieldset,
        disableable: FORM_CONTROLS.has(element.tagName.getText(source)) && (inFieldset || ownDisabled),
        tokens: classTokens(node.initializer, source),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return attributes
}

/** An own hover or press paint or scale with no `enabled:` guard on a control that can be disabled. */
function ungatedOwnTokens({ at, inFieldset, disableable, tokens }: ClassAttribute) {
  if (!disableable) return []
  return tokens.filter(({ token, gated }) => {
    const match = INTERACTION_TOKEN.exec(token)
    return match !== null && !match.groups!.group && !match.groups!.chain!.split(':').includes('enabled') && !(gated && !inFieldset)
  }).map(({ token }) => `${at} ${token}`)
}

/** A group hover or press paint keyed to a control that can be disabled, with neither a `group-enabled/` guard nor a `group-disabled/` reset. */
function ungatedGroupTokens(attributes: ClassAttribute[]) {
  const groups = new Set(attributes.filter(({ disableable }) => disableable).flatMap(({ tokens }) => tokens.flatMap(({ token }) => /^group\/([\w-]+)$/.exec(token)?.[1] ?? [])))
  return attributes.flatMap(({ at, tokens }) => tokens.flatMap(({ token }) => {
    const match = INTERACTION_TOKEN.exec(token)
    const name = match?.groups?.group ? match.groups.name : undefined
    if (!name || !groups.has(name) || token.includes(`group-enabled/${name}:`)) return []
    const utility = /:((?:bg|text)-)/.exec(token)?.[1]
    return tokens.some(({ token: reset }) => reset.startsWith(`group-disabled/${name}:${utility}`)) ? [] : [`${at} ${token}`]
  }))
}

/** Every hover or press paint or scale on a habit control that can be disabled, directly or by the form's fieldset, that still applies while it is disabled. */
function ungatedInteractionPaint() {
  return habitSourceFiles(HABITS).flatMap((file) => {
    const attributes = classAttributes(file)
    return [...attributes.flatMap(ungatedOwnTokens), ...ungatedGroupTokens(attributes)]
  })
}

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
    for (const busy of [false, true]) {
      render(<RadioRowsWhile busy={busy} />)
      names.push(...classNamesIn(document))
      cleanup()
    }
    rules = await compileClassRules(names)
  }, 60_000)

  /** The rules that scale the pressed control itself; a rule with a child combinator scales its content instead. */
  function pressScaleRules(control: Element) {
    return rules.rulesFor(control).filter((rule) => rule.declarations.has('scale') && rule.state.includes(':active') && !rule.state.includes('>'))
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

  it.each([['enabled', false], ['disabled', true]] as const)('applies the proposed picker row title promotion on hover and on press only while the row is enabled: %s', (_, disabled) => {
    render(<ProposedPickerRow disabled={disabled} />)
    const title = screen.getByRole('button', { name: 'Reading' }).querySelector('[class*="group-hover/picker"]')!
    const promotions = rules.rulesFor(title).filter((rule) => rule.declarations.get('color') === 'var(--fg-2)')
    expect(promotions).toHaveLength(2)
    for (const { state } of promotions) expect(title.matches(state.replace(/:hover|:active/, ''))).toBe(!disabled)
  })

  it.each([['enabled', false], ['disabled', true]] as const)('applies every hover and press rule of a radio row, its personal text and its reason disclosure only while the form fieldset is enabled: %s', (_, disabled) => {
    render(<InFieldset disabled={disabled}><FormRadioRows /></InFieldset>)
    const applies = [...document.querySelectorAll('fieldset *')].flatMap((element) => rules.rulesFor(element)
      .filter(({ state }) => /:hover|:active/.test(state))
      .map(({ state }) => element.matches(`*${state.replace(/:hover|:active/g, '')}`)))
    expect(applies.length).toBeGreaterThan(0)
    expect(applies).toEqual(applies.map(() => !disabled))
  })

  it.each([['idle', false], ['busy', true]] as const)('paints the radio row hover and press fill only while the row is idle, as its mobile mirror does: %s', (_, busy) => {
    render(<RadioRowsWhile busy={busy} />)
    const rows = screen.getAllByRole('radio')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row).toBeEnabled()
      expect(row.getAttribute('aria-disabled')).toBe(busy ? 'true' : null)
      const paints = rules.rulesFor(row).filter((rule) => /:hover|:active/.test(rule.state) && INTERACTION_PAINT.some((property) => rule.declarations.has(property)))
      const applied = paints.filter((rule) => row.matches(`*${rule.state.replace(/:hover|:active/g, '')}`)).map((rule) => rule.state)
      if (busy) expect(applied).toEqual([])
      else expect(applied).toEqual([':enabled:hover', ':enabled:active'])
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

describe('habit form controls in source', () => {
  it('lists the fieldset files HabitFormFields renders', () => {
    const fields = readFileSync('components/habits/habit-form-fields.tsx', 'utf8')
    for (const file of FIELDSET_FILES.filter((prefix) => prefix.endsWith('.tsx'))) expect(fields).toContain(`from './${file.replace(/\.tsx$/, '')}'`)
    expect(fields).toContain("from './habit-form-fields/")
  })

  it('gates every hover and press paint or scale of a control that can be disabled, directly or by the form fieldset, on :enabled', () => {
    expect(ungatedInteractionPaint()).toEqual([])
  })
})
