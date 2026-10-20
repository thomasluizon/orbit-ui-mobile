import { act, cleanup, fireEvent, render, renderHook, waitFor, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHabitRowLargeText } from '@/components/habits/use-habit-row-large-text'
import { HabitTextScaleFixture } from '../../support/habit-text-scale-fixture'

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('font-size')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function phase(container: HTMLElement) {
  return {
    rootFont: getComputedStyle(document.documentElement).fontSize,
    headings: Array.from(container.querySelectorAll('[data-testid="habit-row"]'))
      .map((row) => row.querySelectorAll('[data-habit-row-heading]').length),
  }
}

it.each(['before hydration', 'before passive subscription'] as const)(
  'catches a root font change %s and keeps live row subscriptions across selection', async (timing) => {
    document.documentElement.style.fontSize = '16px'
    const surface = <HabitTextScaleFixture fontBeforeSubscription={timing === 'before passive subscription' ? '32px' : undefined} />
    const container = document.createElement('div')
    container.innerHTML = renderToString(surface)
    document.body.append(container)
    expect(phase(container)).toEqual({ rootFont: '16px', headings: [0, 0] })
    const rows = Array.from(container.querySelectorAll('[data-testid="habit-row"]'))
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const subscribe = vi.spyOn(window, 'addEventListener')
    const recoverable = vi.fn()
    if (timing === 'before hydration') document.documentElement.style.fontSize = '32px'
    let root: Root | undefined
    try {
      await act(async () => { root = hydrateRoot(container, surface, { onRecoverableError: recoverable }) })
      await waitFor(() => expect(phase(container)).toEqual({ rootFont: '32px', headings: [1, 1] }))
      expect(recoverable).not.toHaveBeenCalled()
      expect(observe.mock.calls.filter(([target]) => target === document.documentElement)).toHaveLength(2)
      expect(subscribe.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(2)
      for (const selecting of [false, true]) {
        if (selecting) fireEvent.click(within(container).getByRole('button', { name: 'Select rows' }))
        expect(container.querySelectorAll('[data-habit-row-control="selection"]')).toHaveLength(selecting ? 2 : 0)
        for (const fontSize of ['16px', '32px', '16px']) {
          await act(async () => { document.documentElement.style.fontSize = fontSize })
          await waitFor(() => expect(phase(container)).toEqual({
            rootFont: fontSize, headings: fontSize === '32px' ? [1, 1] : [0, 0],
          }))
          expect(Array.from(container.querySelectorAll('[data-testid="habit-row"]'))).toEqual(rows)
        }
      }
    } finally {
      await act(async () => root?.unmount())
      container.remove()
    }
  },
)

it('delivers computed stylesheet font changes through the real resize subscription', async () => {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = 'html{font-size:16px}'
  document.head.append(stylesheet)
  const { container } = render(<HabitTextScaleFixture />)
  try {
    await act(async () => {})
    for (const fontSize of ['32px', '16px']) {
      await act(async () => { stylesheet.textContent = `html{font-size:${fontSize}}` })
      expect(getComputedStyle(document.documentElement).fontSize).toBe(fontSize)
      expect(phase(container).headings).toEqual(fontSize === '32px' ? [0, 0] : [1, 1])
      await act(async () => { window.dispatchEvent(new Event('resize')) })
      await waitFor(() => expect(phase(container)).toEqual({
        rootFont: fontSize, headings: fontSize === '32px' ? [1, 1] : [0, 0],
      }))
    }
  } finally { stylesheet.remove() }
})

describe('root text subscription frames', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    document.documentElement.style.fontSize = '16px'
  })

  it('coalesces root attribute and resize invalidations into one frame per mounted row', async () => {
    render(<HabitTextScaleFixture />)
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    const computedStyle = vi.spyOn(window, 'getComputedStyle')

    await act(async () => {
      document.documentElement.style.fontSize = '17px'
      window.dispatchEvent(new Event('resize'))
    })
    expect(requestFrame).toHaveBeenCalledTimes(2)
    expect(computedStyle).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(computedStyle).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => { window.dispatchEvent(new Event('resize')) })
    expect(requestFrame).toHaveBeenCalledTimes(4)
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(computedStyle).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['root attribute', 'resize'] as const)(
    'reads the current 16/32/16 snapshot in the frame after a real %s notification', async (source) => {
      document.documentElement.style.removeProperty('font-size')
      const stylesheet = document.createElement('style')
      stylesheet.textContent = 'html{font-size:16px}'
      document.head.append(stylesheet)
      try {
        const { result } = renderHook(useHabitRowLargeText)
        const computedStyle = vi.spyOn(window, 'getComputedStyle')
        expect(result.current).toBe(false)
        for (const fontSize of ['32px', '16px']) {
          computedStyle.mockClear()
          await act(async () => {
            if (source === 'root attribute') document.documentElement.style.fontSize = fontSize
            else {
              stylesheet.textContent = `html{font-size:${fontSize}}`
              window.dispatchEvent(new Event('resize'))
            }
          })
          expect(result.current).toBe(fontSize === '16px')
          expect(computedStyle).not.toHaveBeenCalled()
          await act(async () => { vi.advanceTimersToNextFrame() })
          expect(computedStyle).toHaveBeenCalledWith(document.documentElement)
          expect(result.current).toBe(fontSize === '32px')
          expect(vi.getTimerCount()).toBe(0)
        }
      } finally { stylesheet.remove() }
    },
  )

  it('samples the latest root font when several changes share a pending frame', async () => {
    const { result } = renderHook(useHabitRowLargeText)
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    const computedStyle = vi.spyOn(window, 'getComputedStyle')
    for (const fontSize of ['32px', '16px', '32px']) {
      await act(async () => { document.documentElement.style.fontSize = fontSize })
    }
    expect(result.current).toBe(false)
    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(computedStyle).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(result.current).toBe(true)

    for (const fontSize of ['16px', '32px', '16px']) {
      await act(async () => { document.documentElement.style.fontSize = fontSize })
    }
    expect(result.current).toBe(true)
    expect(requestFrame).toHaveBeenCalledTimes(2)
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(result.current).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps pending frames owned by their individual subscriptions', async () => {
    const first = renderHook(useHabitRowLargeText)
    const second = renderHook(useHabitRowLargeText)
    await act(async () => { document.documentElement.style.fontSize = '32px' })
    expect(vi.getTimerCount()).toBe(2)
    first.unmount()
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(first.result.current).toBe(false)
    expect(second.result.current).toBe(true)
    await act(async () => { document.documentElement.style.fontSize = '16px' })
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(second.result.current).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending frame on unmount and detaches both notification sources', async () => {
    const { unmount } = renderHook(useHabitRowLargeText)
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const computedStyle = vi.spyOn(window, 'getComputedStyle')
    await act(async () => {
      document.documentElement.style.fontSize = '32px'
      window.dispatchEvent(new Event('resize'))
    })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(cancelFrame).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    computedStyle.mockClear()
    await act(async () => {
      document.documentElement.style.fontSize = '16px'
      window.dispatchEvent(new Event('resize'))
    })
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(computedStyle).not.toHaveBeenCalled()
  })

  it('does not notify or schedule from retained callbacks after cleanup', async () => {
    const subscribe = vi.spyOn(window, 'addEventListener')
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    const { unmount } = renderHook(useHabitRowLargeText)
    const computedStyle = vi.spyOn(window, 'getComputedStyle')
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    expect(requestFrame).toHaveBeenCalledTimes(1)
    const resizeListener = subscribe.mock.calls.find(([type]) => type === 'resize')?.[1]
    expect(resizeListener).toBeTypeOf('function')
    unmount()
    await act(async () => {
      for (const [frameCallback] of requestFrame.mock.calls) frameCallback(performance.now())
      if (typeof resizeListener === 'function') resizeListener(new Event('resize'))
    })
    expect(computedStyle).not.toHaveBeenCalled()
    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['16px', false], ['20.8px', false], ['21px', true], ['32px', true],
  ] as const)('keeps the synchronous %s snapshot at the existing threshold', (fontSize, largeText) => {
    document.documentElement.style.fontSize = fontSize
    const { result } = renderHook(useHabitRowLargeText)
    expect(result.current).toBe(largeText)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the server snapshot false even when the document font is enlarged', () => {
    document.documentElement.style.fontSize = '32px'
    const container = document.createElement('div')
    container.innerHTML = renderToString(<HabitTextScaleFixture />)
    expect(phase(container)).toEqual({ rootFont: '32px', headings: [0, 0] })
    expect(vi.getTimerCount()).toBe(0)
  })
})
