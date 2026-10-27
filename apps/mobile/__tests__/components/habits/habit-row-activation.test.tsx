import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppState, type AppStateStatus } from 'react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))

const TestRenderer = require('react-test-renderer')

const listeners = new Map<string, (...values: AppStateStatus[]) => void>()
let renderer: ReturnType<typeof TestRenderer.create>

beforeEach(() => {
  vi.useFakeTimers()
  AppState.currentState = 'active'
  vi.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    listeners.set(event, listener)
    return { remove: () => listeners.delete(event) }
  })
})
afterEach(() => {
  TestRenderer.act(() => renderer.unmount())
  listeners.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function emit(event: 'change' | 'blur' | 'focus', status?: AppStateStatus) {
  TestRenderer.act(() => {
    if (status) AppState.currentState = status
    if (status) listeners.get(event)?.(status)
    else listeners.get(event)?.()
  })
}

function renderRow(isSelectMode: boolean) {
  const actions = { onDetail: vi.fn(), onToggleSelection: vi.fn(), onLongPressCard: vi.fn() }
  TestRenderer.act(() => { renderer = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read' })} isSelectMode={isSelectMode} actions={actions} />) })
  const body = () => renderer.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.delayLongPress === 500)!
  const tap = () => TestRenderer.act(() => { body().props.onPressIn(); body().props.onPressOut(); body().props.onPress() })
  return { actions, body, tap, primary: isSelectMode ? actions.onToggleSelection : actions.onDetail }
}

describe.each([false, true])('native habit row activation, selecting=%s', (selectMode) => {
  it.each(['background', 'blur'] as const)('discards a press interrupted by %s', (interruption) => {
    const { body, actions, primary, tap } = renderRow(selectMode)
    TestRenderer.act(() => body().props.onPressIn())
    if (interruption === 'background') emit('change', 'background')
    else emit('blur')
    TestRenderer.act(() => {
      vi.advanceTimersByTime(500)
      body().props.onLongPress?.()
    })
    expect(actions.onLongPressCard).not.toHaveBeenCalled()
    emit('change', 'active')
    emit('focus')
    TestRenderer.act(() => { body().props.onPressOut(); body().props.onPress() })
    expect(actions.onDetail).not.toHaveBeenCalled()
    expect(actions.onToggleSelection).not.toHaveBeenCalled()
    tap()
    expect(primary).toHaveBeenCalledOnce()
    expect(selectMode ? actions.onDetail : actions.onToggleSelection).not.toHaveBeenCalled()
  })

  it('keeps accessibility activation available in the foreground', () => {
    const { body, primary } = renderRow(selectMode)
    TestRenderer.act(() => body().props.onPress())
    expect(primary).toHaveBeenCalledOnce()
  })
})
