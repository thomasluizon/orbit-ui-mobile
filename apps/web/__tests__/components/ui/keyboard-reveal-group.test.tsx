import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyboardRevealGroup } from '@/components/ui/keyboard-reveal-group'

const FULL_HEIGHT = 667
const KEYBOARD_OPEN_HEIGHT = 380

class FakeVisualViewport extends EventTarget {
  width = 375
  height = FULL_HEIGHT
  scale = 1
  resizeTo(height: number, scale = 1) {
    this.height = height
    this.scale = scale
    this.dispatchEvent(new Event('resize'))
  }
}

const resizeCallbacks: ResizeObserverCallback[] = []
let viewport: FakeVisualViewport
let reducedMotion = false
const scrollIntoView = vi.fn()

function layoutViewportHeight(height: number) {
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: height })
}

function renderGroup() {
  return render(<>
    <input aria-label="Outside" />
    <KeyboardRevealGroup testID="login-field-action">
      <input aria-label="Email" />
      <div data-testid="check" />
      <button type="submit">Continue</button>
    </KeyboardRevealGroup>
  </>)
}

function focusField(name: string) {
  act(() => screen.getByRole('textbox', { name }).focus())
}

/** The size report a browser delivers after `observe()` and after every later size change. */
function reportGroupSizes() {
  act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)))
}

describe('KeyboardRevealGroup (web)', () => {
  beforeEach(() => {
    viewport = new FakeVisualViewport()
    reducedMotion = false
    resizeCallbacks.length = 0
    scrollIntoView.mockReset()
    layoutViewportHeight(FULL_HEIGHT)
    vi.stubGlobal('visualViewport', viewport)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion }))
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback) }
      observe() {}
      disconnect() {}
    })
    HTMLElement.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document.documentElement, 'clientHeight')
  })

  it('brings the whole group into view once the keyboard shrinks the viewport after a field of the group takes focus', () => {
    renderGroup()
    focusField('Email')
    expect(scrollIntoView).not.toHaveBeenCalled()
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('login-field-action'))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
  })

  it('brings the group into view when a field of it takes focus while the keyboard is already open', () => {
    renderGroup()
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    expect(scrollIntoView).not.toHaveBeenCalled()
    focusField('Email')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('reveals the group on Android, where the keyboard resizes the layout viewport too', () => {
    renderGroup()
    focusField('Email')
    layoutViewportHeight(KEYBOARD_OPEN_HEIGHT)
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('brings the group into view again when it grows while its field keeps focus', () => {
    renderGroup()
    focusField('Email')
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    reportGroupSizes()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('brings a group into view that mounts while the Android keyboard already shortens both viewports, as the code step does after the e-mail step', () => {
    const emailStep = renderGroup()
    reportGroupSizes()
    focusField('Email')
    layoutViewportHeight(KEYBOARD_OPEN_HEIGHT)
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    emailStep.unmount()
    scrollIntoView.mockReset()
    resizeCallbacks.length = 0
    render(<KeyboardRevealGroup testID="login-field-action">
      <input aria-label="Code" autoFocus />
      <button type="submit">Verify</button>
    </KeyboardRevealGroup>)
    reportGroupSizes()
    expect(scrollIntoView).toHaveBeenCalled()
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByTestId('login-field-action'))
  })

  it('scrolls without animation under reduced motion', () => {
    reducedMotion = true
    renderGroup()
    focusField('Email')
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' })
  })

  it('leaves the page still when the focused field is outside the group, the keyboard is closed or the person zooms', () => {
    renderGroup()
    focusField('Outside')
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    expect(scrollIntoView).not.toHaveBeenCalled()
    focusField('Email')
    scrollIntoView.mockReset()
    act(() => viewport.resizeTo(FULL_HEIGHT))
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT, 2))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('stops listening to the viewport once the group unmounts', () => {
    const removeEventListener = vi.spyOn(viewport, 'removeEventListener')
    const { unmount } = renderGroup()
    focusField('Email')
    unmount()
    act(() => viewport.resizeTo(KEYBOARD_OPEN_HEIGHT))
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('keeps the group as far from the keyboard edge as a focused field', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    expect(stylesheet).toMatch(/:where\([^)]*\binput\b[^)]*\[data-keyboard-reveal-group\][^)]*\) \{\n {2}scroll-margin-block: var\(--orbit-space-24\);/)
  })
})
