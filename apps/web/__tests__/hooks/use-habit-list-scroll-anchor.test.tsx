import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { useHabitListScrollAnchor } from '@/hooks/use-habit-list-scroll-anchor'
import { motionDurations } from '@orbit/shared/theme'

vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => false }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function List({ ids, parentId = null }: Readonly<{ ids: string[]; parentId?: string | null }>) {
  const ref = useHabitListScrollAnchor(parentId)
  return <div data-shell-scroller="" style={{ position: 'relative', paddingTop: 0 }}><div ref={ref} data-habit-list="" style={{ overflowAnchor: 'none' }}>
    <ListPresence>{ids.map((id) => <ListMotionItem key={id}><button>{id}</button></ListMotionItem>)}</ListPresence>
  </div></div>
}

it('keeps a pending scroll through initial observation and subsequent viewport resizing', async () => {
  vi.useFakeTimers()
  const callbacks: ResizeObserverCallback[] = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback) }
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  let viewportHeight = 740
  let scrollHeight = 5000
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => viewportHeight)
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return new DOMRect(0, this.hasAttribute('data-habit-list') ? -this.parentElement!.scrollTop : 0, 412, viewportHeight)
  })
  const view = render(<List ids={['first']} />)
  const scroller = view.container.querySelector<HTMLElement>('[data-shell-scroller]')!
  scroller.scrollTop = 650
  fireEvent.scroll(scroller)
  viewportHeight = 800
  act(() => callbacks.forEach(callback => callback([], {} as ResizeObserver)))
  expect(scroller.scrollTop).toBe(650)
  fireEvent.scroll(scroller)
  await act(() => vi.advanceTimersByTime(100))
  scrollHeight = 950
  viewportHeight = 860
  scroller.scrollTop = scrollHeight - viewportHeight
  act(() => callbacks.forEach(callback => callback([], {} as ResizeObserver)))
  expect(scroller.scrollTop).toBe(650)
  scroller.scrollTop = 0
  fireEvent.scroll(scroller)
  await act(() => vi.advanceTimersByTime(100))
  expect(scroller.scrollTop).toBe(0)
})

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

it('starts each drill parent at the top without preserving the previous list offset', async () => {
  vi.useFakeTimers()
  const view = render(<List ids={['parent']} />)
  const scroller = view.container.querySelector<HTMLElement>('[data-shell-scroller]')!
  scroller.scrollTop = 650
  fireEvent.scroll(scroller)
  await act(() => vi.advanceTimersByTime(100))
  view.rerender(<List ids={['child']} parentId="parent" />)
  expect(scroller.scrollTop).toBe(0)
  scroller.scrollTop = 240
  fireEvent.scroll(scroller)
  await act(() => vi.advanceTimersByTime(100))
  view.rerender(<List ids={['child', 'another-child']} parentId="parent" />)
  expect(scroller.scrollTop).toBe(240)
  view.rerender(<List ids={['grandchild']} parentId="child" />)
  expect(scroller.scrollTop).toBe(0)
})
