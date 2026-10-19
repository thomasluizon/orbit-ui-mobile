import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useHabitViewSearch } from '@/hooks/use-habit-view-search'

afterEach(() => vi.useRealTimers())

it.each(['all', 'general'])('searches the %s view and clears when its scope changes', (view) => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ scope }) => useHabitViewSearch(scope), { initialProps: { scope: `account:${view}` } })
  act(() => result.current.toggle())
  act(() => result.current.changeText('  child  '))
  expect(result.current.text).toBe('  child  ')
  expect(result.current.query).toBe('')
  act(() => { vi.advanceTimersByTime(300) })
  expect(result.current.query).toBe('child')
  expect(result.current.open).toBe(true)
  rerender({ scope: 'replacement:today' })
  expect(result.current).toMatchObject({ query: '', text: '', open: false })
  act(() => { vi.advanceTimersByTime(300) })
  expect(result.current.query).toBe('')
})

it('closes search without allowing a pending debounce to restore it', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useHabitViewSearch('all'))
  act(() => { result.current.toggle(); result.current.changeText('walk') })
  act(() => result.current.close())
  act(() => { vi.advanceTimersByTime(300) })
  expect(result.current).toMatchObject({ open: false, text: '', query: '' })
})
