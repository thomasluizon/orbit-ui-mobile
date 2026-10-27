import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { motionDurations, motionLayerTiming } from '@orbit/shared/theme'
import { ConversationChange, ConversationReveal, ConversationCrossfade } from '@/components/chat/conversation-motion'

const state = vi.hoisted(() => ({ reduced: false, start: vi.fn(), stop: vi.fn(), set: vi.fn(), initial: undefined as unknown }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => state.reduced }))
vi.mock('motion/react', async () => {
  const React = await import('react')
  const controls = { start: state.start, stop: state.stop, set: state.set }
  return {
    useAnimationControls: () => controls,
    motion: { div: ({ children, initial, animate: _animate, transition: _transition, ...props }: { children: React.ReactNode; initial: unknown; animate: unknown; transition?: unknown }) => {
      state.initial = initial
      return React.createElement('div', props, children)
    } },
  }
})
beforeEach(() => { vi.clearAllMocks(); state.reduced = false })

it('reveals immediately actionable content with bounded token sequencing', () => {
  const press = vi.fn()
  const { container } = render(<ConversationReveal animate index={100}><button onClick={press}>Approve</button></ConversationReveal>)
  expect(state.initial).toEqual({ opacity: 0.6, y: motionLayerTiming.conversationShift })
  expect(Number(container.firstElementChild?.getAttribute('data-motion-delay'))).toBeLessThan(motionDurations.conversation)
  fireEvent.click(screen.getByRole('button'))
  expect(press).toHaveBeenCalledOnce()
  expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ transition: expect.objectContaining({ duration: motionDurations.conversation / 1000 }) }))
})

it('keeps history static and settles a live reduced-motion change', () => {
  const { rerender } = render(<ConversationReveal><span>History</span></ConversationReveal>)
  expect(state.initial).toBe(false)
  rerender(<ConversationReveal animate><span>Reply</span></ConversationReveal>)
  state.reduced = true
  act(() => rerender(<ConversationReveal animate><span>Reply</span></ConversationReveal>))
  expect(state.stop).toHaveBeenCalled()
  expect(state.set).toHaveBeenLastCalledWith({ opacity: 1, y: 0 })
  expect(screen.getByText('Reply')).toBeVisible()
})

it('commits replacement content immediately and cancels its fade on preference change', () => {
  const { rerender } = render(<ConversationChange changeKey="preview"><button>Approve</button></ConversationChange>)
  rerender(<ConversationChange changeKey="done"><span>Saved</span></ConversationChange>)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('Saved')).toBeVisible()
  expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ transition: expect.objectContaining({ duration: motionDurations.micro / 1000 }) }))
  state.reduced = true
  rerender(<ConversationChange changeKey="done"><span>Saved</span></ConversationChange>)
  expect(state.set).toHaveBeenLastCalledWith({ opacity: 1 })
})

it('crossfades a refreshed block with an inert outgoing snapshot and removes it on reduced motion', () => {
  const { container, rerender } = render(<ConversationCrossfade changeKey="first"><button>Old action</button></ConversationCrossfade>)
  rerender(<ConversationCrossfade changeKey="second"><button>New action</button></ConversationCrossfade>)
  expect(screen.getByRole('button', { name: 'New action' })).toBeVisible()
  const departing = container.querySelector('[inert]')
  expect(departing).toHaveAttribute('aria-hidden', 'true')
  expect(departing).toHaveTextContent('Old action')
  state.reduced = true
  rerender(<ConversationCrossfade changeKey="second"><button>New action</button></ConversationCrossfade>)
  expect(container.querySelector('[inert]')).toBeNull()
  expect(screen.queryByText('Old action')).toBeNull()
})
