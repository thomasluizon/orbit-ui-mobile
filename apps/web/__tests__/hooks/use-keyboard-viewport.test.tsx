import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeKeyboardViewport, useKeyboardViewport } from '@/hooks/use-keyboard-viewport'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function KeyboardForm() {
  const rootRef = useRef<HTMLDivElement>(null)
  useKeyboardViewport(rootRef)
  return <div ref={rootRef} data-testid="keyboard-form">
    <div data-testid="fields" style={{ overflowY: 'auto' }}><textarea aria-label="Message" /></div>
    <footer><button type="button">Send</button></footer>
  </div>
}

function createViewport() {
  let height = 740
  let offsetTop = 0
  const element = document.createElement('div')
  Object.defineProperties(element, {
    height: { get: () => height }, width: { value: 360 },
    offsetTop: { get: () => offsetTop }, offsetLeft: { value: 0 },
    pageTop: { value: 0 }, pageLeft: { value: 0 }, scale: { value: 1 },
  })
  const viewport = element as unknown as VisualViewport
  vi.stubGlobal('visualViewport', viewport)
  return { viewport, resize: (nextHeight: number, nextTop = 0) => {
    height = nextHeight
    offsetTop = nextTop
    viewport.dispatchEvent(new Event('resize'))
  } }
}

describe('Keyboard viewport', () => {
  it('shrinks the screen above pinned actions and reveals a focused field again when it grows', () => {
    let resizeCallback: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
      observe() {}
      disconnect() {}
    })
    const { viewport, resize } = createViewport()
    render(<KeyboardForm />)
    const root = screen.getByTestId('keyboard-form')
    const scroller = screen.getByTestId('fields')
    const field = screen.getByRole('textbox', { name: 'Message' })
    let fieldHeight = 54
    Object.defineProperty(scroller, 'clientHeight', { get: () => Number.parseFloat(root.style.height) - 100 })
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, viewport.offsetTop, 360, scroller.clientHeight))
    vi.spyOn(field, 'getBoundingClientRect').mockImplementation(() => new DOMRect(16, 580 - scroller.scrollTop, 328, fieldHeight))
    act(() => { field.focus(); resize(420) })
    expect(root.style.height).toBe('420px')
    expect(root.style.minHeight).toBe('420px')
    expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(420 - 100 - 24)
    fieldHeight = 96
    fireEvent.change(field, { target: { value: 'A longer message' } })
    act(() => resizeCallback?.([], {} as ResizeObserver))
    expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(420 - 100 - 24)
    act(() => resize(740))
    expect(root.style.height).toBe('740px')
  })

  it('retains remaining subscribers when nested hosts unmount in either order', () => {
    const { viewport } = createViewport()
    const previousScroll = vi.fn()
    viewport.onscroll = previousScroll
    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = subscribeKeyboardViewport(viewport, first)
    const releaseSecond = subscribeKeyboardViewport(viewport, second)
    releaseFirst()
    viewport.dispatchEvent(new Event('scroll'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    expect(previousScroll).toHaveBeenCalledOnce()
    releaseSecond()
    expect(viewport.onscroll).toBe(previousScroll)
    viewport.dispatchEvent(new Event('resize'))
    expect(second).toHaveBeenCalledOnce()
  })
})
