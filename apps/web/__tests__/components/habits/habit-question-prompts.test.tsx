import { expectSmallSheetActions } from '@/__tests__/support/sheet-slots'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitListConfirmDialogs } from '@/components/habits/habit-list/confirm-dialogs'
import { ChecklistCompletePrompt, LogDatePrompt } from '@/components/habits/habit-detail-prompts'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const date = '2026-09-12'
const root = createMockHabit({ id: 'root', title: 'Morning', scheduledDates: [date] })
const parent = createMockHabit({ id: 'parent', title: 'Stretch', parentId: root.id, scheduledDates: [date] })
const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: [date] })
const promptOf = (ancestorHabits: typeof root[]) => {
  const ancestors = ancestorHabits.map((habit) => ({ habit, mode: 'log' as const }))
  return { ...ancestors[0]!, childId: child.id, ancestors, selectedCount: 1, date }
}

const handlers = () => ({
  onSelectParentAncestor: vi.fn(), onConfirmDelete: vi.fn(), onCancelDelete: vi.fn(), onDeleteClosed: vi.fn(),
  onConfirmDuplicate: vi.fn(), onCancelDuplicate: vi.fn(), onCancelParent: vi.fn(), onConfirmParent: vi.fn(),
})
type Handlers = ReturnType<typeof handlers>
function dialogs(spies: Handlers, props: Partial<React.ComponentProps<typeof HabitListConfirmDialogs>>) {
  return <HabitListConfirmDialogs t={(key) => key} parentPrompt={null} showDeleteConfirm={false} deletePending={false} deleteHabitName="" deleteDescendantCount={0} duplicateHabitName={null} {...spies} {...props} />
}
const answers = () => [...document.querySelectorAll<HTMLButtonElement>('[data-slot="sheet-actions"] button')]
const options = () => [...document.querySelectorAll<HTMLButtonElement>('[data-option-card]')]
const settle = () => act(() => vi.advanceTimersByTimeAsync(0))

beforeEach(() => { vi.useFakeTimers(); useUIStore.setState({ openOverlayIds: [] }) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('web habit prompts as one question', () => {
  it('asks the parent question as the sheet title, with the two answers as the sheet actions, the positive answer last', async () => {
    const spies = handlers()
    render(dialogs(spies, { parentPrompt: promptOf([parent]) }))
    expect(screen.getByRole('dialog', { name: 'habits.autoLogParentMessage' })).toBeInTheDocument()
    expect(answers().map((answer) => answer.textContent)).toEqual(['common.notNow', 'habits.autoLogParentConfirm'])
    expect(options()).toHaveLength(0)
    expect(document.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
    fireEvent.click(answers()[1]!)
    await settle()
    expect(spies.onConfirmParent).toHaveBeenCalledOnce()
    expect(spies.onCancelParent).not.toHaveBeenCalled()
  })

  it('sends the cancel of the parent prompt from the first answer', async () => {
    const spies = handlers()
    render(dialogs(spies, { parentPrompt: promptOf([parent]) }))
    fireEvent.click(answers()[0]!)
    await settle()
    expect(spies.onCancelParent).toHaveBeenCalledOnce()
    expect(spies.onConfirmParent).not.toHaveBeenCalled()
  })

  it('keeps the ancestor choices as the free path with its own action', async () => {
    const spies = handlers()
    render(dialogs(spies, { parentPrompt: promptOf([parent, root]) }))
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    fireEvent.click(boxes[1]!)
    expect(spies.onSelectParentAncestor).toHaveBeenCalledWith(1, true)
    fireEvent.click(screen.getByRole('button', { name: 'chat.pendingOp.action.applyChanges' }))
    await settle()
    expect(spies.onConfirmParent).toHaveBeenCalledOnce()
  })

  it('draws the answers with the plain confirm buttons, not as tiles', () => {
    render(dialogs(handlers(), { duplicateHabitName: 'Read' }))
    expectSmallSheetActions()
    expect(answers().map((answer) => answer.getAttribute('data-variant'))).toEqual(['ghost', 'primary'])
  })

  it('draws each answer as a native button, so Enter and Space reach its handler, and fires only that handler', async () => {
    const spies = handlers()
    render(dialogs(spies, { duplicateHabitName: 'Read' }))
    const [cancel] = answers()
    expect(answers().map((answer) => [answer.tagName, answer.type])).toEqual([['BUTTON', 'button'], ['BUTTON', 'button']])
    cancel!.focus()
    expect(document.activeElement).toBe(cancel)
    fireEvent.click(cancel!)
    await settle()
    expect(spies.onCancelDuplicate).toHaveBeenCalledOnce()
    expect(spies.onConfirmDuplicate).not.toHaveBeenCalled()
  })

  it('asks the duplicate question with quick options and sends the same request', async () => {
    const spies = handlers()
    render(dialogs(spies, { duplicateHabitName: 'Read' }))
    expect(screen.getByRole('dialog', { name: 'habits.duplicateConfirmTitle' })).toBeInTheDocument()
    expect(answers().map((answer) => answer.textContent)).toEqual(['common.notNow', 'habits.duplicateConfirm'])
    fireEvent.click(answers()[1]!)
    await settle()
    expect(spies.onConfirmDuplicate).toHaveBeenCalledOnce()
  })

  it('keeps the delete confirmation as a destructive confirmation with no quick option and no mascot', () => {
    render(dialogs(handlers(), { showDeleteConfirm: true, deleteHabitName: 'Read' }))
    expect(screen.getByRole('dialog', { name: 'habits.deleteConfirmTitle' })).toBeInTheDocument()
    expect(options()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'habits.deleteHabit' })).toBeInTheDocument()
    expect(document.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })

  it('asks the checklist question after the last item', async () => {
    const onConfirm = vi.fn()
    render(<ChecklistCompletePrompt open name="Read" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: 'habits.checklistCompleteQuestion' })).toBeInTheDocument()
    expect(screen.getByRole('dialog').querySelector('p')).toBeNull()
    expect(answers().map((answer) => answer.textContent)).toEqual(['common.notNow', 'habits.checklistCompleteConfirm'])
    fireEvent.click(answers()[1]!)
    await settle()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it.each([['log', 'habits.detail.logDateQuestion', 'habits.detail.logDateConfirmLog'], ['unlog', 'habits.detail.logDateUnlogQuestion', 'habits.detail.logDateConfirmUnlog']] as const)('asks one question before a %s on another date', async (intent, question, answer) => {
    const onConfirm = vi.fn()
    render(<LogDatePrompt pending={{ habitId: 'h', intent, date, name: 'Read', permanent: false }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: question })).toBeInTheDocument()
    expect(answers().map((option) => option.textContent)).toEqual(['common.notNow', answer])
    fireEvent.click(answers()[1]!)
    await settle()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the confirmation for a removal that cannot be undone', () => {
    const view = render(<LogDatePrompt pending={{ habitId: 'h', intent: 'unlog', date, name: 'Read', permanent: true }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'habits.detail.logDateConfirmTitle' })).toBeInTheDocument()
    expect(screen.getByText('habits.detail.logDateConfirmPermanentUnlogMessage')).toBeInTheDocument()
    expect(options()).toHaveLength(0)
    view.unmount()
  })

  it('writes each question as a question and each answer in at most 4 words, in both locales', () => {
    for (const messages of [en, ptBR]) {
      const questions = [messages.habits.autoLogParentMessage, messages.habits.autoSkipParentMessage, messages.habits.checklistCompleteQuestion, messages.habits.duplicateConfirmTitle, messages.habits.detail.logDateQuestion, messages.habits.detail.logDateUnlogQuestion]
      for (const question of questions) expect(question.endsWith('?')).toBe(true)
      const answers = [messages.habits.autoLogParentConfirm, messages.habits.autoSkipParentConfirm, messages.habits.checklistCompleteConfirm, messages.habits.duplicateConfirm, messages.habits.detail.logDateConfirmLog, messages.habits.detail.logDateConfirmUnlog, messages.common.notNow]
      for (const answer of answers) expect(answer.split(' ').length).toBeLessThanOrEqual(4)
    }
  })
})
