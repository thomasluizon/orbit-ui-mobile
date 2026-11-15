import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
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
const options = () => [...document.querySelectorAll<HTMLButtonElement>('[data-option-card]')]
const settle = () => act(() => vi.advanceTimersByTimeAsync(0))

beforeEach(() => { vi.useFakeTimers(); useUIStore.setState({ openOverlayIds: [] }) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('web habit prompts as one question', () => {
  it('asks the parent question as the sheet title, with the two answers as quick options', async () => {
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    render(dialogs(spies, { parentPrompt: promptOf([parent]) }))
    expect(screen.getByRole('dialog', { name: 'habits.autoLogParentMessage' })).toBeInTheDocument()
    expect(options().map((option) => option.textContent)).toEqual(['habits.autoLogParentConfirm', 'common.notNow'])
    expect(document.querySelector('[data-slot="sheet-actions"]')).toBeNull()
    expect(document.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
    fireEvent.click(options()[0]!)
    await settle()
    expect(spies.onConfirmParent).toHaveBeenCalledOnce()
    expect(spies.onCancelParent).not.toHaveBeenCalled()
  })

  it('sends the cancel of the parent prompt from the second quick option', async () => {
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    render(dialogs(spies, { parentPrompt: promptOf([parent]) }))
    fireEvent.click(options()[1]!)
    await settle()
    expect(spies.onCancelParent).toHaveBeenCalledOnce()
    expect(spies.onConfirmParent).not.toHaveBeenCalled()
  })

  it('keeps the ancestor choices as the free path with its own action', async () => {
    enableTestFlags('orbit_guided_flows')
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

  it('moves focus between the answers with the arrow keys and selects nothing', () => {
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    render(dialogs(spies, { duplicateHabitName: 'Read' }))
    const [first, second] = options()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)
    expect(spies.onConfirmDuplicate).not.toHaveBeenCalled()
    expect(spies.onCancelDuplicate).not.toHaveBeenCalled()
  })

  it('asks the duplicate question with quick options and sends the same request', async () => {
    enableTestFlags('orbit_guided_flows')
    const spies = handlers()
    render(dialogs(spies, { duplicateHabitName: 'Read' }))
    expect(screen.getByRole('dialog', { name: 'habits.duplicateConfirmTitle' })).toBeInTheDocument()
    expect(options().map((option) => option.textContent)).toEqual(['habits.duplicateConfirm', 'common.notNow'])
    fireEvent.click(options()[0]!)
    await settle()
    expect(spies.onConfirmDuplicate).toHaveBeenCalledOnce()
  })

  it('keeps the delete confirmation as a destructive confirmation with no quick option and no mascot', () => {
    enableTestFlags('orbit_guided_flows')
    render(dialogs(handlers(), { showDeleteConfirm: true, deleteHabitName: 'Read' }))
    expect(screen.getByRole('dialog', { name: 'habits.deleteConfirmTitle' })).toBeInTheDocument()
    expect(options()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'habits.deleteHabit' })).toBeInTheDocument()
    expect(document.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })

  it('renders the current confirm sheets with the flag off', () => {
    const spies = handlers()
    const view = render(dialogs(spies, { parentPrompt: promptOf([parent]) }))
    expect(screen.getByRole('dialog', { name: 'habits.autoLogParentTitle' })).toBeInTheDocument()
    expect(options()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'habits.autoLogParentConfirm' })).toBeInTheDocument()
    view.unmount()
    render(dialogs(spies, { duplicateHabitName: 'Read' }))
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument()
    expect(options()).toHaveLength(0)
  })

  it('asks the checklist question after the last item', async () => {
    enableTestFlags('orbit_guided_flows')
    const onConfirm = vi.fn()
    render(<ChecklistCompletePrompt open name="Read" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: 'habits.checklistCompleteQuestion' })).toBeInTheDocument()
    expect(screen.getByText('habits.checklistCompleteLine')).toBeInTheDocument()
    expect(options().map((option) => option.textContent)).toEqual(['habits.checklistCompleteConfirm', 'common.notNow'])
    fireEvent.click(options()[0]!)
    await settle()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the checklist confirm sheet with the flag off', () => {
    render(<ChecklistCompletePrompt open name="Read" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'habits.checklistCompleteTitle' })).toBeInTheDocument()
    expect(options()).toHaveLength(0)
  })

  it.each([['log', 'habits.detail.logDateQuestion', 'habits.detail.logDateConfirmLog'], ['unlog', 'habits.detail.logDateUnlogQuestion', 'habits.detail.logDateConfirmUnlog']] as const)('asks one question before a %s on another date', async (intent, question, answer) => {
    enableTestFlags('orbit_guided_flows')
    const onConfirm = vi.fn()
    render(<LogDatePrompt pending={{ habitId: 'h', intent, date, name: 'Read', permanent: false }} fallbackName="Read" fallbackDate={date} language="en" onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: question })).toBeInTheDocument()
    expect(options().map((option) => option.textContent)).toEqual([answer, 'common.notNow'])
    fireEvent.click(options()[0]!)
    await settle()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps the confirmation for a removal that cannot be undone, and the current sheet with the flag off', () => {
    enableTestFlags('orbit_guided_flows')
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
