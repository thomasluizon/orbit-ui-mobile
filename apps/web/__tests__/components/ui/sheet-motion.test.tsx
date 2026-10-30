import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { HTMLMotionProps, MotionValue, PanInfo } from 'motion/react'
import { Sheet } from '@/components/ui/sheet'

const gesture = vi.hoisted(() => ({
  reduced: false,
  end: undefined as HTMLMotionProps<'div'>['onDragEnd'],
  y: undefined as MotionValue<number> | undefined,
  cancel: vi.fn(), start: vi.fn(), settle: vi.fn(),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('motion/react', async (original) => {
  const actual = await original<typeof import('motion/react')>()
  const controls = { cancel: gesture.cancel, start: gesture.start }
  return {
    ...actual,
    animate: gesture.settle.mockImplementation(actual.animate),
    useDragControls: () => controls,
    motion: { ...actual.motion, div: ({ children, className, onDragEnd, style }: Omit<HTMLMotionProps<'div'>, 'children'> & { children?: ReactNode }) => {
      gesture.end = onDragEnd
      gesture.y = style?.y as MotionValue<number>
      return <div className={className}>{children}</div>
    } },
  }
})

function release(offset: number, velocity: number, eventType = 'pointerup') {
  const position: PanInfo = { point: { x: 0, y: offset }, delta: { x: 0, y: 0 }, offset: { x: 0, y: offset }, velocity: { x: 0, y: velocity } }
  act(() => gesture.end?.(new MouseEvent(eventType), position))
}

let preference: EventTarget
beforeEach(() => {
  gesture.reduced = false
  gesture.settle.mockClear(); gesture.cancel.mockClear(); gesture.start.mockClear()
  preference = new EventTarget()
  const query = Object.assign(preference, {
    get matches() { return gesture.reduced },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
  })
  Object.defineProperty(query, 'matches', { get: () => gesture.reduced })
  vi.spyOn(window, 'matchMedia').mockReturnValue(query)
})
afterEach(() => vi.restoreAllMocks())

it('allows the grabber to follow a pointer and dismisses a downward fling through the existing close path', async () => {
  const closed = vi.fn()
  const view = render(<Sheet title="Options" onClose={closed}><button>Action</button></Sheet>)
  fireEvent.pointerDown(view.container.ownerDocument.querySelector('.orbit-sheet-grabber-target')!)
  expect(gesture.start).toHaveBeenCalledOnce()
  release(24, 800)
  await waitFor(() => expect(closed).toHaveBeenCalledOnce())
})

it('settles a short or upward release with the shared spring and retains working controls', () => {
  const closed = vi.fn()
  const action = vi.fn()
  render(<Sheet title="Options" onClose={closed}><button onClick={action}>Action</button></Sheet>)
  release(24, -500)
  expect(gesture.settle).toHaveBeenLastCalledWith(expect.anything(), 0, expect.objectContaining({ type: 'spring', stiffness: 360, damping: 38, mass: 1, velocity: 0 }))
  fireEvent.click(screen.getByRole('button', { name: 'Action' }))
  expect(action).toHaveBeenCalledOnce()
  expect(closed).not.toHaveBeenCalled()
})

it('cancels travel immediately when reduced motion changes while a sheet is open', () => {
  render(<Sheet title="Options" onClose={vi.fn()}><button>Action</button></Sheet>)
  gesture.y?.set(40)
  act(() => { gesture.reduced = true; preference.dispatchEvent(new Event('change')) })
  expect(gesture.cancel).toHaveBeenCalled()
  expect(gesture.y?.get()).toBe(0)
})

it('returns a dragged sheet to rest when its dismiss guard refuses', async () => {
  const refused = vi.fn()
  render(<Sheet title="Options" onAttemptDismiss={refused}><button>Action</button></Sheet>)
  gesture.y?.set(120)
  release(120, 800)
  expect(refused).toHaveBeenCalledOnce()
  expect(gesture.settle).toHaveBeenLastCalledWith(gesture.y, 0, expect.objectContaining({ type: 'spring' }))
  await waitFor(() => expect(gesture.y?.get()).toBe(0))
  expect(screen.getByRole('dialog')).toBeVisible()
})

it('settles a cancelled gesture without dismissing the sheet', () => {
  const closed = vi.fn()
  render(<Sheet title="Options" onClose={closed}><button>Action</button></Sheet>)
  release(120, 800, 'pointercancel')
  expect(gesture.settle).toHaveBeenCalled()
  expect(closed).not.toHaveBeenCalled()
})
