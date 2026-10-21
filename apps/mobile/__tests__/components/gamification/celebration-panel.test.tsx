import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppState, StyleSheet, View } from 'react-native'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useUIStore } from '@/stores/ui-store'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { Shell412 } from '@/components/shell/shell-412'

const TestRenderer = require('react-test-renderer')
const motion = vi.hoisted(() => ({ reduced: true }))
const copy = vi.hoisted(() => ({ suffix: '' }))
beforeEach(() => { copy.suffix = '' })
const selectPlural = vi.hoisted(() => vi.fn((text: string) => `selected:${text}`))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}${copy.suffix}` }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  usePrefersReducedMotion: () => motion.reduced,
}))
vi.mock('@/lib/plural', () => ({ plural: selectPlural }))

describe('CelebrationPanel mobile', () => {
  beforeEach(() => {
    motion.reduced = true
    selectPlural.mockClear()
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })

  it('keeps the full neutral panel, screen, and composer available when motion is disabled', () => {
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Shell412
          notice={<CelebrationPanel />}
          composer={<View testID="astra-composer" />}
          tabBar={<View testID="tab-bar" />}
        >
          <View testID="habit-list" />
        </Shell412>,
      )
    })

    expect(tree!.root.findByProps({ testID: 'celebration-panel' })).toBeTruthy()
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'celebration-panel' }).props.style).marginHorizontal ?? 0).toBe(0)
    expect(tree!.root.findByProps({ testID: 'celebration-ring' })).toBeTruthy()
    expect(tree!.root.findAllByProps({ testID: 'celebration-ring-travel' })).toHaveLength(0)
    expect(tree!.root.findAllByProps({ accessibilityViewIsModal: true })).toHaveLength(0)
    expect(tree!.root.findByProps({ testID: 'shell-background' }).props.importantForAccessibility).toBe('auto')
    expect(tree!.root.findByProps({ testID: 'shell-scroller' }).findByProps({ testID: 'habit-list' })).toBeTruthy()
    expect(tree!.root.findByProps({ testID: 'shell-pinned-slot' }).findByProps({ testID: 'astra-composer' })).toBeTruthy()
    expect(selectPlural).toHaveBeenCalledWith('celebration.day.line:{"count":1}', 1)
    expect(JSON.stringify(tree!.toJSON())).toContain('selected:celebration.day.line')
    TestRenderer.act(() => tree!.unmount())
  })

  it('renders the goal unit and uses a complete sentence when the unit is empty', () => {
    useUIStore.getState().enqueueCelebration('goal-completed', {
      name: 'Distance',
      count: 5,
      unit: 'km',
    })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CelebrationPanel />)
    })
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'celebration.goal.line:{\\"name\\":\\"Distance\\",\\"count\\":5,\\"unit\\":\\"km\\"}',
    )

    TestRenderer.act(() => {
      useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
      useUIStore.getState().enqueueCelebration('goal-completed', {
        name: 'Untitled target',
        count: 1,
        unit: '',
      })
    })
    expect(JSON.stringify(tree!.toJSON())).toContain(
      'celebration.goal.lineWithoutUnit:{\\"name\\":\\"Untitled target\\",\\"count\\":1}',
    )
    TestRenderer.act(() => tree!.unmount())
  })
})


describe('daily streak presentation', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the new number statically with reduced motion and dismisses itself', () => {
    vi.useFakeTimers()
    motion.reduced = true
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], dailyStreakMomentDate: '' })
    useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<CelebrationPanel />) })
    const moment = tree!.root.findByProps({ testID: 'daily-streak-moment' })
    expect(moment.props['data-motion']).toBe('static')
    expect(tree!.root.findByProps({ testID: 'daily-streak-number' }).props.children).toBe('5')
    expect(tree!.root.findAllByProps({ testID: 'daily-streak-previous' })).toHaveLength(0)
    TestRenderer.act(() => { vi.advanceTimersByTime(2500) })
    expect(tree!.root.findAllByProps({ testID: 'daily-streak-moment' })).toHaveLength(0)
    TestRenderer.act(() => tree!.unmount())
  })
})


it('keeps the daily moment while its close button has focus', () => {
  vi.useFakeTimers()
  motion.reduced = true
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<CelebrationPanel />) })
  const close = tree!.root.findAllByProps({ accessibilityLabel: 'celebration.close:{}' }).at(-1)!
  TestRenderer.act(() => close.props.onFocus())
  TestRenderer.act(() => { vi.advanceTimersByTime(5000) })
  expect(tree!.root.findAllByProps({ testID: 'daily-streak-moment' }).length).toBeGreaterThan(0)
  TestRenderer.act(() => close.props.onBlur())
  TestRenderer.act(() => { vi.advanceTimersByTime(2500) })
  expect(tree!.root.findAllByProps({ testID: 'daily-streak-moment' })).toHaveLength(0)
  TestRenderer.act(() => tree!.unmount())
  vi.useRealTimers()
})


it('mounts an empty daily announcement before publishing the final streak', () => {
  vi.useFakeTimers()
  motion.reduced = true
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<CelebrationPanel />) })
  const announcement = tree!.root.findByProps({ testID: 'daily-streak-announcement' })
  expect(announcement.props.children).toBe('')
  TestRenderer.act(() => { vi.advanceTimersByTime(0) })
  expect(announcement.props.children).toBe('selected:streakDisplay.badge.tooltip:{"count":5}')
  TestRenderer.act(() => tree!.unmount())
  vi.useRealTimers()
})


it('animates one daily change and leaves the next queued fact available after timeout', () => {
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<CelebrationPanel />) })
  expect(tree!.root.findByProps({ testID: 'daily-streak-moment' }).props['data-motion']).toBe('animated')
  expect(tree!.root.findByProps({ testID: 'daily-streak-previous' }).props.children).toBe('4')
  TestRenderer.act(() => { vi.advanceTimersByTime(2500) })
  expect(tree!.root.findAllByProps({ testID: 'daily-streak-moment' })).toHaveLength(0)
  expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  TestRenderer.act(() => { vi.advanceTimersByTime(5000) })
  expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  TestRenderer.act(() => tree!.unmount())
  vi.useRealTimers()
})


it.each(['daily-streak', 'streak'] as const)('retains the actual %s queue item and native panel until exit finishes', (kind) => {
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration(kind, { streak: kind === 'streak' ? 7 : 5 })
  const id = useUIStore.getState().activeCelebration!.id
  useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<CelebrationPanel />) })
  try {
    const close = tree!.root.findAllByProps({ accessibilityLabel: 'celebration.close:{}' }).at(-1)!
    TestRenderer.act(() => close.props.onPress())
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    expect(tree!.root.findAllByProps({ testID: kind === 'streak' ? 'celebration-panel' : 'daily-streak-moment' }).length).toBeGreaterThan(0)
    TestRenderer.act(() => { vi.advanceTimersByTime(219) })
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    TestRenderer.act(() => { vi.advanceTimersByTime(1) })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  } finally {
    TestRenderer.act(() => tree!.unmount())
    vi.useRealTimers()
  }
})

function mountNotice(kind: 'daily-streak' | 'streak' = 'daily-streak') {
  useUIStore.getState().enqueueCelebration(kind, { streak: kind === 'streak' ? 7 : 5 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<CelebrationPanel />) })
  const panels = () => tree!.root.findAll((node: any) => typeof node.props['data-phase'] === 'string')
  const close = () => tree!.root.findAll((node: any) => node.props.accessibilityRole === 'button').at(-1)!
  return { close: () => { close().props.onPress() },
    hover: (value: boolean) => { panels().at(-1)!.props[value ? 'onPointerEnter' : 'onPointerLeave']({ nativeEvent: { pointerType: 'mouse' } }) },
    focus: (value: boolean) => { close().props[value ? 'onFocus' : 'onBlur']() },
    phase: () => panels().at(-1)?.props['data-phase'], rerender: () => tree!.update(<CelebrationPanel />),
    present: () => panels().length > 0,
    statusCount: () => tree!.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite').length,
    announcement: () => tree!.root.findByProps({ testID: 'daily-streak-announcement' }).props.children,
    unmount: () => tree!.unmount() }
}

describe('actual notice interruption guards', () => {
  let notice: ReturnType<typeof mountNotice>
  let background: (state: import('react-native').AppStateStatus) => void
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    motion.reduced = false
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { background = listener; return { remove: vi.fn() } })
  })
  afterEach(() => {
    TestRenderer.act(() => { notice.unmount() })
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps close during entry committed through repeat activation, queue arrival and late hover', () => {
    notice = mountNotice()
    const id = useUIStore.getState().activeCelebration!.id
    TestRenderer.act(() => { vi.advanceTimersByTime(80); notice.close() })
    TestRenderer.act(() => {
      useUIStore.getState().enqueueCelebration('level-up', { level: 3 })
      notice.close(); notice.hover(true)
    })
    expect(notice.phase()).toBe('manual-exit')
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    TestRenderer.act(() => { vi.advanceTimersByTime(219) })
    expect(useUIStore.getState().activeCelebration?.id).toBe(id)
    TestRenderer.act(() => { vi.advanceTimersByTime(1) })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
    TestRenderer.act(() => { vi.advanceTimersByTime(5000) })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })

  it('accepts keyboard focus during automatic exit without requiring hover', () => {
    notice = mountNotice()
    TestRenderer.act(() => { vi.advanceTimersByTime(2350) })
    TestRenderer.act(() => { notice.focus(true) })
    expect(notice.phase()).toBe('hold')
    TestRenderer.act(() => { vi.advanceTimersByTime(5000) })
    expect(notice.present()).toBe(true)
    TestRenderer.act(() => { notice.focus(false) })
    TestRenderer.act(() => { vi.advanceTimersByTime(2500) })
    expect(notice.present()).toBe(false)
  })

  it('cancels an automatic exit on late hover and waits for both pause reasons', () => {
    notice = mountNotice()
    TestRenderer.act(() => { vi.advanceTimersByTime(2350) })
    expect(notice.phase()).toBe('automatic-exit')
    TestRenderer.act(() => { notice.hover(true); notice.focus(true) })
    expect(notice.phase()).toBe('hold')
    TestRenderer.act(() => { vi.advanceTimersByTime(5000); notice.hover(false) })
    expect(notice.present()).toBe(true)
    TestRenderer.act(() => { vi.advanceTimersByTime(5000); notice.focus(false) })
    TestRenderer.act(() => { vi.advanceTimersByTime(2499) })
    expect(notice.present()).toBe(true)
    TestRenderer.act(() => { vi.advanceTimersByTime(1) })
    expect(notice.present()).toBe(false)
  })

  it('retains the original deadline across live preference changes', () => {
    notice = mountNotice()
    TestRenderer.act(() => { vi.advanceTimersByTime(1000); motion.reduced = true; notice.rerender() })
    expect(notice.phase()).toBe('hold')
    TestRenderer.act(() => { vi.advanceTimersByTime(1499) })
    expect(notice.present()).toBe(true)
    TestRenderer.act(() => { vi.advanceTimersByTime(1) })
    expect(notice.present()).toBe(false)
  })

  it.each(['manual', 'automatic'] as const)('completes a pending %s exit immediately when reduced motion changes', (kind) => {
    notice = mountNotice()
    TestRenderer.act(() => { if (kind === 'manual') notice.close(); else vi.advanceTimersByTime(2280) })
    TestRenderer.act(() => { motion.reduced = true; notice.rerender() })
    expect(notice.present()).toBe(false)
  })

  it('clears outgoing content across A-to-B-to-A before the queue resets', () => {
    notice = mountNotice()
    TestRenderer.act(() => { notice.close(); advanceAccountGeneration(); advanceAccountGeneration() })
    expect(notice.present()).toBe(false)
    TestRenderer.act(() => {
      useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
      useUIStore.getState().enqueueCelebration('level-up', { level: 4 })
      vi.advanceTimersByTime(5000)
    })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })

  it('discards invalidated content and its pending completion', () => {
    notice = mountNotice()
    TestRenderer.act(() => { notice.close(); useUIStore.setState({ activeCelebration: null }) })
    expect(notice.present()).toBe(false)
    TestRenderer.act(() => {
      useUIStore.getState().enqueueCelebration('level-up', { level: 5 })
      vi.advanceTimersByTime(5000)
    })
    expect(useUIStore.getState().activeCelebration?.kind).toBe('level-up')
  })

  it('settles on background and removes an expired item by clock on resume', () => {
    notice = mountNotice()
    const visibility = (value: boolean) => { background(value ? 'background' : 'active') }
    TestRenderer.act(() => { vi.advanceTimersByTime(80); visibility(true) })
    expect(notice.phase()).toBe('hold')
    TestRenderer.act(() => { vi.setSystemTime(3000); visibility(false) })
    expect(notice.present()).toBe(false)
  })

  it('announces one complete fact once through rerender, exit and resumed motion', () => {
    notice = mountNotice()
    expect(notice.announcement()).toBe('')
    TestRenderer.act(() => { vi.advanceTimersByTime(0) })
    const announcement = notice.announcement()
    TestRenderer.act(() => { copy.suffix = ':translated'; notice.rerender() })
    TestRenderer.act(() => { vi.advanceTimersByTime(0) })
    expect(notice.announcement()).toBe(announcement)
    expect(announcement).toContain('streakDisplay.badge.tooltip')
    TestRenderer.act(() => { notice.rerender(); vi.advanceTimersByTime(280) })
    expect(notice.phase()).toBe('hold')
    expect(notice.statusCount()).toBe(1)
    TestRenderer.act(() => { notice.close() })
    expect(notice.announcement()).toBe(announcement)
    expect(notice.statusCount()).toBe(1)
  })
})

it('hands native keyboard focus to the next close and then the stable shell main target', async () => {
  const { __getFocusedNativeTag, __setTouchMode } = await import('../../../test-mocks/react-native')
  vi.useFakeTimers()
  motion.reduced = false
  __setTouchMode(false)
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
  useUIStore.getState().enqueueCelebration('level-up', { level: 2 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<Shell412 notice={<CelebrationPanel />} tabBar={<View testID="tabs" />}><View testID="task" /></Shell412>) })
  try {
    const focusRoot = tree!.root.findAll((node: any) => typeof node.props.onFocusCapture === 'function').at(-1)!
    const close = () => tree!.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityLabel === 'celebration.close:{}').at(-1)!
    const previousTag = close().props.__nativeTag
    TestRenderer.act(() => {
      focusRoot.props.onFocusCapture({ nativeEvent: { target: previousTag } })
      close().props.onFocus()
      close().props.onPress()
    })
    TestRenderer.act(() => { vi.advanceTimersByTime(220) })
    expect(__getFocusedNativeTag()).toBe(close().props.__nativeTag)
    TestRenderer.act(() => {
      focusRoot.props.onFocusCapture({ nativeEvent: { target: close().props.__nativeTag } })
      close().props.onFocus()
      close().props.onPress()
    })
    TestRenderer.act(() => { vi.advanceTimersByTime(220) })
    const main = tree!.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'shell-scroller').at(-1)!
    expect(__getFocusedNativeTag()).toBe(main.props.__nativeTag)
  } finally { TestRenderer.act(() => { tree!.unmount() }); __setTouchMode(true); vi.useRealTimers() }
})

it('restores the connected native originating control and declines recovery after task focus moves', async () => {
  const { ShellFocusTargetContext } = await import('@/components/shell/shell-focus-target')
  const origin = { isConnected: true, focus: vi.fn() } as unknown as import('react-native').HostInstance
  let focusedTarget: number | null = null
  const focusMain = vi.fn()
  const host = { currentHost: () => origin, currentTarget: () => focusedTarget, focusMain }
  vi.useFakeTimers()
  motion.reduced = false
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ShellFocusTargetContext.Provider value={host}><CelebrationPanel /></ShellFocusTargetContext.Provider>) })
  const close = () => tree!.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityLabel === 'celebration.close:{}').at(-1)!
  try {
    TestRenderer.act(() => { focusedTarget = close().props.__nativeTag; close().props.onFocus(); close().props.onPress() })
    TestRenderer.act(() => { vi.advanceTimersByTime(220) })
    expect(origin.focus).toHaveBeenCalledTimes(1)
    expect(focusMain).not.toHaveBeenCalled()
    TestRenderer.act(() => { useUIStore.getState().enqueueCelebration('streak', { streak: 14 }) })
    TestRenderer.act(() => { focusedTarget = close().props.__nativeTag; close().props.onFocus(); close().props.onPress(); focusedTarget = -1 })
    TestRenderer.act(() => { vi.advanceTimersByTime(220) })
    expect(origin.focus).toHaveBeenCalledTimes(1)
    expect(focusMain).not.toHaveBeenCalled()
  } finally { TestRenderer.act(() => { tree!.unmount() }); vi.useRealTimers() }
})
