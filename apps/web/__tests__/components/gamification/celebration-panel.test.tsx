import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { ShellWide } from '@/components/shell/shell-wide'

const motion = vi.hoisted(() => ({ reduced: false }))
const copy = vi.hoisted(() => ({ suffix: '' }))
beforeEach(() => { copy.suffix = '' })
const selectPlural = vi.hoisted(() => vi.fn((text: string) => `selected:${text}`))

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return motion.reduced }, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
})
vi.mock('@/lib/plural', () => ({ plural: selectPlural }))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}${copy.suffix}`,
}))

describe('CelebrationPanel', () => {
  beforeEach(() => {
    motion.reduced = false
    selectPlural.mockClear()
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })

  it('renders the finished fact without motion when reduced motion is enabled', () => {
    motion.reduced = true
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    const { container } = render(<CelebrationPanel />)

    expect(container.querySelector('[data-celebration-panel]')).toHaveAttribute('data-phase', 'hold')
    expect(container.querySelector('[data-entering]')).toBeNull()
    expect(selectPlural).toHaveBeenCalledWith('celebration.day.line:{"count":1}', 1)
    expect(container.textContent).toContain('selected:celebration.day.line:{"count":1}')
  })

  it('renders the goal unit and uses a complete sentence when the unit is empty', () => {
    useUIStore.getState().enqueueCelebration('goal-completed', {
      name: 'Distance',
      count: 5,
      unit: 'km',
    })
    const { container, rerender } = render(<CelebrationPanel />)

    expect(container.textContent).toContain(
      'celebration.goal.line:{"name":"Distance","count":5,"unit":"km"}',
    )

    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    useUIStore.getState().enqueueCelebration('goal-completed', {
      name: 'Untitled target',
      count: 1,
      unit: '',
    })
    rerender(<CelebrationPanel />)

    expect(container.textContent).toContain(
      'celebration.goal.lineWithoutUnit:{"name":"Untitled target","count":1}',
    )
  })

  it('keeps the screen and composer interactive, rests neutral, and promotes the queued fact when closed', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
    vi.useFakeTimers()
    const { container } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={[{ id: 'hoje', href: '/', label: 'Today', icon: 'hoje' }]}
        activeId="hoje"
        navLabel="Main navigation"
        notice={<CelebrationPanel />}
        composer={<button type="button">Open Astra</button>}
        tabBar={<div>Tabs</div>}
      >
        <button type="button">Log habit</button>
      </ShellWide>,
    )

    const panel = container.querySelector('[data-celebration-panel]')
    expect(panel).not.toHaveAttribute('data-blocking')
    expect(panel?.querySelector('circle:last-of-type')).toHaveAttribute('stroke', 'var(--fg-1)')
    expect(panel).not.toHaveAttribute('aria-modal')
    expect(container.querySelector('[data-shell-background]')).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Log habit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open Astra' })).toBeEnabled()

    const closeButton = screen.getByRole('button', { name: 'celebration.close:{}' })
    closeButton.focus()
    act(() => { closeButton.click() })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('streak')
    act(() => { vi.advanceTimersByTime(220) })
    const promotedPanel = container.querySelector('[data-celebration-panel]')
    expect(promotedPanel).not.toBe(panel)
    expect(screen.getByRole('button', { name: 'celebration.close:{}' })).toHaveFocus()
    expect(promotedPanel).toHaveAttribute('data-phase', 'enter')
    vi.useRealTimers()
  })
})


describe('daily streak presentation', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the new number statically with reduced motion and dismisses itself', async () => {
    vi.useFakeTimers()
    motion.reduced = true
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], dailyStreakMomentDate: '' })
    useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
    const { container } = render(<CelebrationPanel />)
    const moment = container.querySelector('[data-daily-streak-moment]')
    expect(moment).toHaveTextContent('5')
    expect(moment).toHaveAttribute('data-motion', 'static')
    expect(moment?.querySelector('[data-previous-streak]')).toBeNull()
    await act(() => vi.advanceTimersByTime(2500))
    expect(container.querySelector('[data-daily-streak-moment]')).toBeNull()
  })
})


it('keeps the daily moment while its close button has focus', async () => {
  vi.useFakeTimers()
  motion.reduced = true
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  const { container, unmount } = render(<CelebrationPanel />)
  const close = screen.getByRole('button', { name: 'celebration.close:{}' })
  act(() => close.focus())
  await act(() => vi.advanceTimersByTime(5000))
  expect(container.querySelector('[data-daily-streak-moment]')).not.toBeNull()
  act(() => close.blur())
  await act(() => vi.advanceTimersByTime(2500))
  expect(container.querySelector('[data-daily-streak-moment]')).toBeNull()
  unmount()
  vi.useRealTimers()
})


it('animates one daily change and leaves the next queued fact available after timeout', async () => {
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
  const { container, unmount } = render(<CelebrationPanel />)
  expect(container.querySelector('[data-daily-streak-moment]')).toHaveAttribute('data-motion', 'animated')
  expect(container.querySelector('[data-previous-streak]')).toHaveTextContent('4')
  await act(() => vi.advanceTimersByTime(2500))
  expect(container.querySelector('[data-daily-streak-moment]')).toBeNull()
  expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  await act(() => vi.advanceTimersByTime(5000))
  expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  unmount()
  vi.useRealTimers()
})


it.each(['daily-streak', 'streak'] as const)('retains the actual %s queue item and DOM until exit finishes', (kind) => {
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration(kind, { streak: kind === 'streak' ? 7 : 5 })
  const id = useUIStore.getState().activeCelebration!.id
  useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
  const { container, unmount } = render(<CelebrationPanel />)
  try {
    const panel = container.querySelector('section')
    act(() => screen.getByRole('button').click())
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    expect(panel?.isConnected).toBe(true)
    act(() => { vi.advanceTimersByTime(219) })
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    act(() => { vi.advanceTimersByTime(1) })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  } finally {
    unmount()
    vi.useRealTimers()
  }
})

function mountNotice(kind: 'daily-streak' | 'streak' = 'daily-streak') {
  useUIStore.getState().enqueueCelebration(kind, { streak: kind === 'streak' ? 7 : 5 })
  const rendered = render(<CelebrationPanel />)
  const panel = () => rendered.container.querySelector('section')
  return { panel, close: () => { screen.getByRole('button').click() },
    hover: (value: boolean) => { const event = new Event(value ? 'pointerover' : 'pointerout', { bubbles: true }); Object.defineProperty(event, 'pointerType', { value: 'mouse' }); fireEvent(panel()!, event) },
    focus: (value: boolean) => { const button = screen.getByRole('button'); if (value) button.focus(); else button.blur() },
    phase: () => panel()?.getAttribute('data-phase'), rerender: () => rendered.rerender(<CelebrationPanel />),
    present: () => !!panel(), statusCount: () => screen.queryAllByRole('status').length,
    announcement: () => screen.getByRole('status').textContent, unmount: rendered.unmount }
}

describe('actual notice interruption guards', () => {
  let notice: ReturnType<typeof mountNotice>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    motion.reduced = false
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })
  afterEach(() => {
    act(() => { notice.unmount() })
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps close during entry committed through repeat activation, queue arrival and late hover', () => {
    notice = mountNotice()
    const id = useUIStore.getState().activeCelebration!.id
    act(() => { vi.advanceTimersByTime(80); notice.close() })
    act(() => {
      useUIStore.getState().enqueueCelebration('level-up', { level: 3 })
      notice.close(); notice.hover(true)
    })
    expect(notice.phase()).toBe('manual-exit')
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    act(() => { vi.advanceTimersByTime(219) })
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    act(() => { vi.advanceTimersByTime(1) })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
    act(() => { vi.advanceTimersByTime(5000) })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })

  it('accepts keyboard focus during automatic exit without requiring hover', () => {
    notice = mountNotice()
    act(() => { vi.advanceTimersByTime(2350) })
    act(() => { notice.focus(true) })
    expect(notice.phase()).toBe('hold')
    act(() => { vi.advanceTimersByTime(5000) })
    expect(notice.present()).toBe(true)
    act(() => { notice.focus(false) })
    act(() => { vi.advanceTimersByTime(2500) })
    expect(notice.present()).toBe(false)
  })

  it('cancels an automatic exit on late hover and waits for both pause reasons', () => {
    notice = mountNotice()
    act(() => { vi.advanceTimersByTime(2350) })
    expect(notice.phase()).toBe('automatic-exit')
    act(() => { notice.hover(true); notice.focus(true) })
    expect(notice.phase()).toBe('hold')
    act(() => { vi.advanceTimersByTime(5000); notice.hover(false) })
    expect(notice.present()).toBe(true)
    act(() => { vi.advanceTimersByTime(5000); notice.focus(false) })
    act(() => { vi.advanceTimersByTime(2499) })
    expect(notice.present()).toBe(true)
    act(() => { vi.advanceTimersByTime(1) })
    expect(notice.present()).toBe(false)
  })

  it('retains the original deadline across live preference changes', () => {
    notice = mountNotice()
    act(() => { vi.advanceTimersByTime(1000); motion.reduced = true; notice.rerender() })
    expect(notice.phase()).toBe('hold')
    act(() => { vi.advanceTimersByTime(1499) })
    expect(notice.present()).toBe(true)
    act(() => { vi.advanceTimersByTime(1) })
    expect(notice.present()).toBe(false)
  })

  it.each(['manual', 'automatic'] as const)('completes a pending %s exit immediately when reduced motion changes', (kind) => {
    notice = mountNotice()
    act(() => { if (kind === 'manual') notice.close(); else vi.advanceTimersByTime(2280) })
    act(() => { motion.reduced = true; notice.rerender() })
    expect(notice.present()).toBe(false)
  })

  it('clears outgoing content across A-to-B-to-A before the queue resets', () => {
    notice = mountNotice()
    act(() => { notice.close(); advanceAccountGeneration(); advanceAccountGeneration() })
    expect(notice.present()).toBe(false)
    act(() => {
      useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
      useUIStore.getState().enqueueCelebration('level-up', { level: 4 })
      vi.advanceTimersByTime(5000)
    })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })

  it('discards invalidated content and its pending completion', () => {
    notice = mountNotice()
    act(() => { notice.close(); useUIStore.setState({ activeCelebration: null }) })
    expect(notice.present()).toBe(false)
    act(() => {
      useUIStore.getState().enqueueCelebration('level-up', { level: 5 })
      vi.advanceTimersByTime(5000)
    })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })

  it('settles on background and removes an expired item by clock on resume', () => {
    notice = mountNotice()
    const visibility = (value: boolean) => { Object.defineProperty(document, 'hidden', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange')) }
    act(() => { vi.advanceTimersByTime(80); visibility(true) })
    expect(notice.phase()).toBe('hold')
    act(() => { vi.setSystemTime(3000); visibility(false) })
    expect(notice.present()).toBe(false)
  })

  it('announces one complete fact once through rerender, exit and resumed motion', () => {
    notice = mountNotice()
    expect(notice.announcement()).toBe('')
    act(() => { vi.advanceTimersByTime(0) })
    const announcement = notice.announcement()
    act(() => { copy.suffix = ':translated'; notice.rerender() })
    act(() => { vi.advanceTimersByTime(0) })
    expect(notice.announcement()).toBe(announcement)
    expect(announcement).toContain('streakDisplay.badge.tooltip')
    act(() => { notice.rerender(); vi.advanceTimersByTime(280) })
    expect(notice.phase()).toBe('hold')
    expect(notice.statusCount()).toBe(1)
    act(() => { notice.close() })
    expect(notice.announcement()).toBe(announcement)
    expect(notice.statusCount()).toBe(1)
  })
})

it('restores a connected origin only after manual keyboard dismissal and respects later task focus', () => {
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  const { unmount } = render(<main tabIndex={-1}><input aria-label="Task" /><input aria-label="Other task" /><CelebrationPanel /></main>)
  try {
    const origin = screen.getByRole('textbox', { name: 'Task' })
    act(() => { origin.focus(); useUIStore.getState().enqueueCelebration('streak', { streak: 7 }) })
    expect(origin).toHaveFocus()
    act(() => { screen.getByRole('button').focus(); screen.getByRole('button').click() })
    act(() => { vi.advanceTimersByTime(220) })
    expect(origin).toHaveFocus()
    act(() => { useUIStore.getState().enqueueCelebration('streak', { streak: 14 }) })
    act(() => { screen.getByRole('button').focus(); screen.getByRole('button').click() })
    const task = screen.getByRole('textbox', { name: 'Other task' })
    act(() => { task.focus(); vi.advanceTimersByTime(220) })
    expect(task).toHaveFocus()
  } finally { unmount(); vi.useRealTimers() }
})

it('uses the stable shell main target when the originating control disappears', () => {
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  const { unmount } = render(<main><CelebrationPanel /></main>)
  try {
    act(() => { useUIStore.getState().enqueueCelebration('streak', { streak: 7 }) })
    act(() => { screen.getByRole('button').focus(); screen.getByRole('button').click() })
    act(() => { vi.advanceTimersByTime(220) })
    expect(screen.getByRole('main')).toHaveFocus()
  } finally { unmount(); vi.useRealTimers() }
})
