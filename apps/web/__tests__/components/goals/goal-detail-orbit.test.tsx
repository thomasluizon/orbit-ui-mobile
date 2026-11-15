import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal, createMockProfile } from '@orbit/shared/__tests__/factories'
import type { GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import { formatLocaleDate } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  guided: true,
  reducedMotion: false,
  router: { push: vi.fn() },
  updateStatus: vi.fn(),
  updateProgress: vi.fn(),
  deleteUndo: vi.fn(),
  deleted: vi.fn(),
}))

const ORBIT_STATES = ['parado', 'olhando', 'pensando', 'feliz', 'descansando']
const listGoal = createMockGoal({ id: '1', title: 'Read 12 books', currentValue: 3, targetValue: 12, unit: 'books', progressPercentage: 25 })
let detailGoal: GoalDetailWithMetrics['goal'] = { ...listGoal, progressHistory: [] }

vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ timeZone: 'UTC' }) }) }))
vi.mock('@/components/goals/edit-goal-modal', () => ({ EditGoalModal: () => null }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({ data: { allGoals: [listGoal], goalsById: new Map([['1', listGoal]]) } }),
  useGoalDetail: (id: string | null) => ({
    data: id ? { goal: detailGoal, metrics: { progressPercentage: detailGoal.progressPercentage, velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline', habitAdherence: [] } } : null,
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: mocks.updateProgress, isPending: false, error: null }),
  useUpdateGoalStatus: () => ({ mutateAsync: mocks.updateStatus, isPending: false, error: null }),
  useDeleteGoal: (options?: { onDeleted?: (undo: () => void) => void }) => ({
    mutateAsync: async (goalId: string) => { mocks.deleted(goalId); options?.onDeleted?.(mocks.deleteUndo) },
    isPending: false,
    error: null,
  }),
}))

import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'

function stubMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? mocks.reducedMotion : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }))
}

const onOpenChange = vi.fn()
function renderDetail({ locale = 'en', inline = true }: { locale?: 'en' | 'pt-BR'; inline?: boolean } = {}) {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
    <GoalDetailDrawer inline={inline} open goalId="1" onOpenChange={onOpenChange} />
  </NextIntlClientProvider>)
}
const resultDialog = () => document.querySelector('[data-result-dialog]')
const shownOrbitStates = () => [...document.querySelectorAll('[data-orbit-state]')].map((node) => node.getAttribute('data-orbit-state'))
async function nextFrames() {
  await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))) })
}

describe('goal detail on the Orbit logic', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    mocks.guided = true
    mocks.reducedMotion = false
    detailGoal = { ...listGoal, progressHistory: [] }
    Object.values(mocks).forEach((value) => { if (typeof value === 'function' && 'mockReset' in value) value.mockReset() })
    mocks.router.push.mockReset()
    onOpenChange.mockReset()
    mocks.updateStatus.mockResolvedValue(undefined)
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
    useUIStore.setState({ astraConversationOpen: false })
    stubMedia()
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it.each([
    ['en', '2026-11-20', '7 days left until the deadline.'],
    ['pt-BR', '2026-11-20', 'Faltam 7 dias para o prazo.'],
    ['en', '2026-11-14', '1 day left until the deadline.'],
    ['pt-BR', '2026-11-14', 'Falta 1 dia para o prazo.'],
    ['en', '2026-11-13', 'The deadline is today.'],
    ['pt-BR', '2026-11-13', 'O prazo é hoje.'],
  ] as const)('states one date fact in the Orbit line in %s for %s', (locale, deadline, sentence) => {
    detailGoal = { ...detailGoal, deadline }
    renderDetail({ locale })
    const line = screen.getByRole('button', { name: sentence })
    expect(line.closest('[data-goal-orbit-line]')).not.toBeNull()
    const face = line.querySelector('[data-asset="orbit-mascot"]')
    expect(face, 'the line row draws Orbit still at 48').toHaveAttribute('width', '48')
    expect(face).toHaveAttribute('data-orbit-face', 'rig')
    expect(face).toHaveAttribute('data-orbit-loop', 'still')
  })

  it('states a passed deadline with its date and never counts the miss', () => {
    detailGoal = { ...detailGoal, deadline: '2026-10-03' }
    renderDetail()
    expect(screen.getByRole('button', { name: `The deadline was ${formatLocaleDate('2026-10-03', 'en')}.` })).toBeInTheDocument()
  })

  it('opens the conversation with the seeded question from the line row', () => {
    detailGoal = { ...detailGoal, deadline: '2026-11-20' }
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: '7 days left until the deadline.' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(screen.queryByRole('button', { name: new RegExp(en.goals.detail.askAstraEyebrow) }), 'the line row is the one way in').not.toBeInTheDocument()
  })

  it('has no line with no deadline and keeps the ask row', () => {
    renderDetail()
    expect(document.querySelector('[data-goal-orbit-line]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `${en.goals.detail.askAstraEyebrow}: ${en.goals.detail.askAstraDefault}` }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('keeps the current detail with the flag off: no line and no result dialog', async () => {
    mocks.guided = false
    detailGoal = { ...detailGoal, deadline: '2026-11-20' }
    renderDetail()
    expect(document.querySelector('[data-goal-orbit-line]')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.goals.detail.markAbandoned })) })
    expect(mocks.updateStatus).toHaveBeenCalled()
    expect(resultDialog()).toBeNull()
  })

  it.each([
    ['active', en.goals.detail.markAbandoned, 'The goal "Read 12 books" is marked as abandoned.', 'parado'],
    ['abandoned', en.goals.detail.reactivate, 'The goal "Read 12 books" is active again.', 'feliz'],
  ] as const)('confirms a %s goal status change with the result dialog', async (status, action, sentence, orbitState) => {
    detailGoal = { ...detailGoal, status: status === 'active' ? 'Active' : 'Abandoned' }
    renderDetail()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: action })) })
    const dialog = await screen.findByRole('dialog', { name: en.result.title })
    expect(dialog).toHaveAccessibleDescription(sentence)
    expect(resultDialog()).toHaveAttribute('data-orbit-state', orbitState)
    fireEvent.click(within(dialog).getByRole('button', { name: en.result.goal.open }))
    await waitFor(() => expect(resultDialog()).toBeNull())
    expect(onOpenChange, 'the goal detail stays open under the dialog').not.toHaveBeenCalled()
  })

  it('confirms a delete with Orbit at rest, offers the undo and opens the goals list', async () => {
    renderDetail({ inline: false })
    fireEvent.click(screen.getByRole('button', { name: en.goals.detail.delete }))
    const confirm = await screen.findByRole('dialog', { name: en.goals.detail.delete })
    expect(confirm.querySelector('[data-asset="orbit-mascot"]'), 'no mascot inside a destructive confirmation').toBeNull()
    await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: en.goals.detail.delete })) })
    const dialog = await screen.findByRole('dialog', { name: en.result.title })
    expect(mocks.deleted).toHaveBeenCalledWith('1')
    expect(dialog).toHaveAccessibleDescription('The goal "Read 12 books" was deleted.')
    expect(resultDialog()).toHaveAttribute('data-orbit-state', 'parado')
    fireEvent.click(within(dialog).getByRole('button', { name: en.result.goal.openList }))
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/progress/goals'))
  })

  it('runs the same undo from the delete dialog and keeps the goal detail', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: en.goals.detail.delete }))
    const confirm = await screen.findByRole('dialog', { name: en.goals.detail.delete })
    await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: en.goals.detail.delete })) })
    fireEvent.click(within(await screen.findByRole('dialog', { name: en.result.title })).getByRole('button', { name: en.undo.action }))
    expect(mocks.deleteUndo).toHaveBeenCalledOnce()
    await waitFor(() => expect(resultDialog()).toBeNull())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('asks one question in the progress sheet, opens no result dialog and sweeps the ring once', async () => {
    mocks.updateProgress.mockImplementation(async () => { detailGoal = { ...detailGoal, currentValue: 6, progressPercentage: 50 } })
    renderDetail({ inline: false })
    fireEvent.click(screen.getByRole('button', { name: en.goals.updateProgress }))
    const sheet = await screen.findByRole('dialog', { name: en.goals.form.progressQuestion })
    const value = within(sheet).getByRole('textbox', { name: en.goals.form.progressQuestion })
    expect(within(sheet).getByRole('textbox', { name: en.goals.form.progressNoteQuestion })).toBeInTheDocument()
    fireEvent.change(value, { target: { value: '6' } })
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: en.common.save })) })
    await waitFor(() => expect(mocks.updateProgress).toHaveBeenCalled())
    const ring = await screen.findByRole('progressbar', { name: en.goals.progressPercentage.replace('{pct}', '50') })
    expect(ring).toHaveAttribute('aria-valuenow', '25')
    expect(ring.parentElement).toHaveAttribute('data-ring-sweep', 'sweeping')
    await nextFrames()
    expect(ring).toHaveAttribute('aria-valuenow', '50')
    expect(resultDialog(), 'a progress update keeps its in-place feedback').toBeNull()
  })

  it('draws the saved progress at once under reduced motion', async () => {
    mocks.reducedMotion = true
    mocks.updateProgress.mockImplementation(async () => { detailGoal = { ...detailGoal, currentValue: 6, progressPercentage: 50 } })
    renderDetail({ inline: false })
    fireEvent.click(screen.getByRole('button', { name: en.goals.updateProgress }))
    const sheet = await screen.findByRole('dialog', { name: en.goals.form.progressQuestion })
    fireEvent.change(within(sheet).getByRole('textbox', { name: en.goals.form.progressQuestion }), { target: { value: '6' } })
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: en.common.save })) })
    const ring = await screen.findByRole('progressbar', { name: en.goals.progressPercentage.replace('{pct}', '50') })
    expect(ring).toHaveAttribute('aria-valuenow', '50')
    expect(ring.parentElement).toHaveAttribute('data-ring-sweep', 'rest')
  })

  it('never shows a sad state', async () => {
    detailGoal = { ...detailGoal, deadline: '2026-10-03' }
    renderDetail()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.goals.detail.markAbandoned })) })
    await screen.findByRole('dialog', { name: en.result.title })
    expect(shownOrbitStates().every((state) => state !== null && ORBIT_STATES.includes(state))).toBe(true)
  })
})
