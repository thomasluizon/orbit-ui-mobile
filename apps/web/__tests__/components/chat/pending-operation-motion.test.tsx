import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import type { PendingOperationMessageState } from '@orbit/shared/chat'
import type { RevisePendingOperation } from '@orbit/shared/hooks'
import { makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'

type Controls = { start: Mock; set: Mock; stop: Mock; subscribe: (node: { current?: unknown }) => () => void; node?: { current?: unknown } }
const motion = vi.hoisted(() => ({ reduced: false, controls: [] as Controls[] }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: (query: string) => query === '(prefers-reduced-motion: reduce)' && motion.reduced }))
/** Each `ConversationChange` gets its own controls, which remember the element they drive. */
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  const { useState } = await import('react')
  return { ...actual, useAnimationControls: () => useState(() => {
    const controls: Controls = { start: vi.fn(), set: vi.fn(), stop: vi.fn(), subscribe: (node) => { controls.node = node; return () => {} } }
    motion.controls.push(controls)
    return controls
  })[0] }
})
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false, timeZone: 'UTC' } }) }))

const items = ['Run', 'Read'].map((name, index) => ({
  itemId: `habit-${index}`, entityId: `habit-${index}`, entityName: name, stateFingerprint: `state-${index}`,
  fields: [{ entityId: `habit-${index}`, entityName: name, field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
}))
const preview = makePendingAgentOperation({ riskClass: 'Low', confirmationRequirement: 'None', previewFingerprint: 'preview-1', items, changeTargetCount: 2 })
const confirm = vi.fn()

/** The card as the conversation holds it: each settled patch returns as the saved state of the message. */
function ConversationCard({ onRevise }: Readonly<{ onRevise?: RevisePendingOperation }>) {
  const [savedState, setSavedState] = useState<PendingOperationMessageState>()
  return <PendingOperationCard pendingOperation={preview} savedState={savedState} onStateChange={(patch) => setSavedState((current) => ({ ...current, ...patch }))}
    onRevise={onRevise} onConfirmExecute={confirm} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
}

const flows = {
  approve: async () => {
    render(<ConversationCard />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.approve' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument())
    expect(confirm).toHaveBeenCalledExactlyOnceWith(preview.id)
  },
  'reject through a revision': async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: { cancelled: true, preview: null } })
    render(<ConversationCard onRevise={revise} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('chat.operation.rejected'))
  },
  'reject with no revision': async () => {
    render(<ConversationCard />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.reject' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('chat.operation.rejected'))
  },
}
const outcomes = Object.keys(flows) as (keyof typeof flows)[]

/** The controls of the card's own change, the outermost one, and not those of the block frame inside it. */
function cardChange(): Controls {
  const element = document.querySelector('[data-conversation-change]')
  const controls = motion.controls.find((candidate) => candidate.node?.current === element)
  expect(controls, 'the card drives its outermost change').toBeDefined()
  return controls!
}

beforeEach(() => {
  vi.clearAllMocks()
  motion.reduced = false
  motion.controls = []
  confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
})

describe('web preview approve and reject motion', () => {
  it.each(outcomes)('settles the row once the %s outcome replaces the preview in the same render', async (outcome) => {
    await flows[outcome]()
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    const settle = cardChange()
    expect(settle.set).toHaveBeenCalledWith({ opacity: 0.6 })
    expect(settle.start).toHaveBeenCalledWith({ opacity: 1, transition: expect.objectContaining({ duration: motionDurations.micro / 1000 }) })
    for (const [definition] of settle.start.mock.calls) expect(Object.keys(definition as object).sort((first, second) => first.localeCompare(second)), 'the settle moves and scales nothing').toEqual(['opacity', 'transition'])
  })

  it.each(outcomes)('shows the %s outcome at once with no settle under reduced motion', async (outcome) => {
    motion.reduced = true
    await flows[outcome]()
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'chat.operation.approve' })).not.toBeInTheDocument()
    for (const controls of motion.controls) {
      expect(controls.start, 'no change of the card or its block frame animates').not.toHaveBeenCalled()
      expect(controls.set).not.toHaveBeenCalledWith({ opacity: 0.6 })
    }
    expect(cardChange().set).toHaveBeenLastCalledWith({ opacity: 1 })
  })
})
