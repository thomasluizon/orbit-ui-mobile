import { act, fireEvent, render } from '@testing-library/react'
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

it('retains every bulk removal and reserves the scrolled viewport until and after exit', async () => {
  vi.useFakeTimers()
  const view = render(<List ids={['first', 'second', 'third']} />)
  const scroller = view.container.querySelector<HTMLElement>('[data-shell-scroller]')!
  const list = view.container.querySelector<HTMLElement>('[data-habit-list]')!
  Object.defineProperty(scroller, 'clientHeight', { value: 300 })
  scroller.scrollTop = 650
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -650, 412, 1200))
  fireEvent.scroll(scroller)
  await act(() => vi.advanceTimersByTimeAsync(32))
  expect(list.style.minHeight).toBe('950px')
  view.rerender(<List ids={[]} />)
  expect(list.querySelectorAll('[data-list-motion][inert]')).toHaveLength(3)
  expect(scroller.scrollTop).toBe(650)
  await act(() => vi.advanceTimersByTime(motionDurations.fast))
  expect(list.querySelectorAll('[data-list-motion]')).toHaveLength(0)
  expect(list.style.minHeight).toBe('950px')
  expect(scroller.scrollTop).toBe(650)
})

it('cancels a departing row when undo restores it during the fade', async () => {
  vi.useFakeTimers()
  const view = render(<List ids={['first']} />)
  view.rerender(<List ids={[]} />)
  view.rerender(<List ids={['first']} />)
  await act(() => vi.advanceTimersByTime(motionDurations.fast))
  expect(view.getByRole('button', { name: 'first' })).not.toHaveAttribute('inert')
})
