import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeKeyboardViewport, useKeyboardViewport } from '@/hooks/use-keyboard-viewport'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

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
  let scale = 1
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(740)
  const element = document.createElement('div')
  Object.defineProperties(element, {
    height: { get: () => height }, width: { value: 360 },
    offsetTop: { get: () => offsetTop }, offsetLeft: { value: 0 },
    pageTop: { value: 0 }, pageLeft: { value: 0 }, scale: { get: () => scale },
  })
  const viewport = element as unknown as VisualViewport
  vi.stubGlobal('visualViewport', viewport)
  return { viewport, resize: (nextHeight: number, nextTop = 0, nextScale = 1) => {
    scale = nextScale
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
    Object.defineProperty(scroller, 'clientHeight', { get: () => (Number.parseFloat(root.style.height) || document.documentElement.clientHeight) - 100 })
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
    expect(root.style.height).toBe('')
    expect(root.style.minHeight).toBe('')
  })

  it('leaves CSS in charge and reveals the field when both viewports shrink', () => {
    let resizeCallback: ResizeObserverCallback | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
      observe() {}
      disconnect() {}
    })
    const { resize } = createViewport()
    render(<KeyboardForm />)
    const root = screen.getByTestId('keyboard-form')
    const scroller = screen.getByTestId('fields')
    const field = screen.getByRole('textbox', { name: 'Message' })
    let fieldHeight = 54
    Object.defineProperty(scroller, 'clientHeight', { get: () => document.documentElement.clientHeight - 100 })
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 360, scroller.clientHeight))
    vi.spyOn(field, 'getBoundingClientRect').mockImplementation(() => new DOMRect(16, 580 - scroller.scrollTop, 328, fieldHeight))
    act(() => field.focus())
    expect(root.style.height).toBe('')
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(420)
    act(() => resize(420))
    expect(root.style.height).toBe('')
    expect(root.style.minHeight).toBe('')
    expect(root.style.getPropertyValue('--keyboard-viewport-height')).toBe('')
    expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(420 - 100 - 24)
    fieldHeight = 96
    fireEvent.change(field, { target: { value: 'A longer message' } })
    act(() => resizeCallback?.([], {} as ResizeObserver))
    expect(field.getBoundingClientRect().bottom).toBeLessThanOrEqual(420 - 100 - 24)
    act(() => resize(740))
    expect(root.style.height).toBe('')
  })

  it('clears a keyboard height when pinch zoom takes over', () => {
    const { resize } = createViewport()
    render(<KeyboardForm />)
    const root = screen.getByTestId('keyboard-form')
    act(() => resize(420))
    expect(root.style.height).toBe('420px')
    act(() => resize(210, 10, 2))
    expect(root.style.height).toBe('')
    expect(root.style.minHeight).toBe('')
  })

  it('keeps event subscriptions when another owner replaces onscroll', () => {
    const { viewport } = createViewport()
    const listener = vi.fn()
    const release = subscribeKeyboardViewport(viewport, listener)
    const otherOwner = vi.fn()
    viewport.onscroll = otherOwner
    viewport.dispatchEvent(new Event('scroll'))
    expect(listener).toHaveBeenCalledOnce()
    expect(otherOwner).toHaveBeenCalledOnce()
    release()
    expect(viewport.onscroll).toBe(otherOwner)
    viewport.dispatchEvent(new Event('scroll'))
    expect(listener).toHaveBeenCalledOnce()
    expect(otherOwner).toHaveBeenCalledTimes(2)
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
