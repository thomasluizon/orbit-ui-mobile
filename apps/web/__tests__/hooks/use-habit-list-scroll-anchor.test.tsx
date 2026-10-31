import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { useHabitListScrollAnchor } from '@/hooks/use-habit-list-scroll-anchor'
import { motionDurations } from '@orbit/shared/theme'

vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => false }))
afterEach(() => vi.useRealTimers())

function List({ ids }: Readonly<{ ids: string[] }>) {
  const ref = useHabitListScrollAnchor()
  return <div data-shell-scroller=""><div ref={ref} data-habit-list="" style={{ overflowAnchor: 'none' }}>
    <ListPresence>{ids.map((id) => <ListMotionItem key={id}><button>{id}</button></ListMotionItem>)}</ListPresence>
  </div></div>
}

it('retains every bulk removal until exit completes', async () => {
  vi.useFakeTimers()
  const view = render(<List ids={['first', 'second', 'third']} />)
  const list = view.container.querySelector<HTMLElement>('[data-habit-list]')!
  view.rerender(<List ids={[]} />)
  expect(list.querySelectorAll('[data-list-motion][inert]')).toHaveLength(3)
  await act(() => vi.advanceTimersByTime(motionDurations.fast))
  expect(list.querySelectorAll('[data-list-motion]')).toHaveLength(0)
})

it('cancels a departing row when undo restores it during the fade', async () => {
  vi.useFakeTimers()
  const view = render(<List ids={['first']} />)
  view.rerender(<List ids={[]} />)
  view.rerender(<List ids={['first']} />)
  await act(() => vi.advanceTimersByTime(motionDurations.fast))
  expect(view.getByRole('button', { name: 'first' })).not.toHaveAttribute('inert')
})
