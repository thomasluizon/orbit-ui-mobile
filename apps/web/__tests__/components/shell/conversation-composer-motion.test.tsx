import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { HTMLMotionProps } from 'motion/react'
import { motionDurations } from '@orbit/shared/theme'
import type { ComposerProps } from '@orbit/shared/contracts/composer'
import { Composer } from '@/components/shell/composer'
import { ConversationComposerMotionProvider } from '@/components/shell/conversation-composer-motion'

const motionState = vi.hoisted(() => ({ reduced: false, rows: [] as HTMLMotionProps<'div'>[], contents: [] as HTMLMotionProps<'div'>[] }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => motionState.reduced }))
vi.mock('motion/react', async original => {
  const actual = await original<typeof import('motion/react')>()
  const MotionDiv = actual.motion.div
  return { ...actual, motion: { ...actual.motion, div: (props: HTMLMotionProps<'div'> & { 'data-composer-input-row'?: boolean; 'data-composer-leading-controls'?: boolean; 'data-composer-trailing-controls'?: boolean }) => {
    if (props['data-composer-input-row']) motionState.rows.push(props)
    if (props['data-composer-leading-controls'] || props['data-composer-trailing-controls']) motionState.contents.push(props)
    return <MotionDiv {...props} />
  } } }
})
const words = { placeholder: 'Message', send: 'Send', clear: 'Clear', paste: 'Paste', nothingToPaste: 'Empty', actions: 'Actions', suggestionsLabel: 'Suggestions' }
const props: ComposerProps = { words, value: 'Draft', state: 'idle', suggestions: [], onChangeValue: vi.fn(), onSend: vi.fn() }
beforeEach(() => { motionState.reduced = false; motionState.rows = []; motionState.contents = []; vi.clearAllMocks() })

it('shares the composer identity across the handoff and keeps send immediate', () => {
  const { rerender } = render(<ConversationComposerMotionProvider><Composer {...props} onOpenConversation={vi.fn()} conversationLabel="Open" /></ConversationComposerMotionProvider>)
  const source = motionState.rows.at(-1)!
  expect(source.layout).toBe(true)
  expect(motionState.contents).toHaveLength(2)
  for (const content of motionState.contents) expect(content.layout).toBe('position')
  expect(source.transition).toMatchObject({ duration: motionDurations.micro / 1000 })
  rerender(<ConversationComposerMotionProvider><Composer {...props} autoFocus /></ConversationComposerMotionProvider>)
  expect(motionState.rows.at(-1)!.layoutId).toBe(source.layoutId)
  expect(screen.getByRole('textbox')).toHaveValue('Draft')
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(props.onSend).toHaveBeenCalledOnce()
})

it('removes layout travel when reduced motion changes live', () => {
  const { rerender } = render(<ConversationComposerMotionProvider><Composer {...props} autoFocus /></ConversationComposerMotionProvider>)
  motionState.reduced = true
  rerender(<ConversationComposerMotionProvider><Composer {...props} autoFocus /></ConversationComposerMotionProvider>)
  expect(motionState.rows.at(-1)!).toMatchObject({ layout: false, transition: { duration: 0 } })
  expect(motionState.rows.at(-1)!.layoutId).toBeUndefined()
  for (const content of motionState.contents.slice(-2)) expect(content.layout).toBe(false)
  expect(screen.getByRole('textbox')).toHaveValue('Draft')
})
