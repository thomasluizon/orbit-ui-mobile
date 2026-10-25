import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { HabitTextScaleFixture } from '../../support/habit-text-scale-fixture'

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('font-size')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

it.each([320, 412, 1352])('hydrates the depth-2 heading and footer before measuring at %spx', async (width) => {
  document.documentElement.style.fontSize = '16px'
  const observations = new Map<Element, { callback: ResizeObserverCallback; observer: ResizeObserver }>()
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { observations.set(target, { callback: this.callback, observer: this }) }
    unobserve(target: Element) { observations.delete(target) }
    disconnect() {
      for (const [target, observation] of observations) if (observation.observer === this) observations.delete(target)
    }
  })
  const surface = <HabitTextScaleFixture includeGrandchild />
  const browserWindow = window
  let serverHtml: string
  vi.stubGlobal('window', undefined)
  try { serverHtml = renderToString(surface) } finally { vi.stubGlobal('window', browserWindow) }
  vi.stubGlobal('innerWidth', width)
  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.append(container)
  const rows = Array.from(container.querySelectorAll('[data-testid="habit-row"]'))
  const grandchild = rows[2]!
  const heading = grandchild.querySelector('[data-habit-row-heading]')!
  const footer = heading.nextElementSibling!
  expect(phase(container)).toEqual({ rootFont: '16px', headings: [0, 0, 1] })
  expect(heading).toHaveTextContent('Grandchild')
  expect(footer).toHaveTextContent('Habit')
  expect(footer).toHaveTextContent('0 of 2')
  const recoverable = vi.fn()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  let root: Root | undefined
  function resize(contentWidth: number) {
    for (const [target, observation] of observations) {
      const size = { inlineSize: contentWidth, blockSize: 52 }
      observation.callback([{
        target, contentRect: new DOMRectReadOnly(0, 0, contentWidth, 52),
        borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size],
      }], observation.observer)
    }
  }
  try {
    await act(async () => { root = hydrateRoot(container, surface, { onRecoverableError: recoverable }) })
    expect(recoverable).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    container.querySelectorAll('[data-testid="habit-row"]').forEach((row, index) => expect(row).toBe(rows[index]))
    expect(grandchild.querySelector('[data-habit-row-heading]')).toBe(heading)
    expect(heading.nextElementSibling).toBe(footer)
    expect(phase(container)).toEqual({ rootFont: '16px', headings: [0, 0, 1] })
    expect(observations.size).toBe(12)
    const assertObservedOwners = () => {
      for (const row of rows) {
        expect(observations.has(row.parentElement!)).toBe(true)
        expect(observations.has(row.querySelector('[data-habit-row-title-block]')!)).toBe(true)
        for (const token of row.querySelectorAll('[data-habit-row-meta] > span')) expect(observations.has(token)).toBe(true)
      }
      expect([...observations.keys()].every((target) => target.isConnected)).toBe(true)
    }
    assertObservedOwners()
    for (const [contentWidth, headings] of [[380, [0, 0, 0]], [284, [0, 0, 1]], [708, [0, 0, 0]]] as const) {
      await act(async () => resize(contentWidth))
      expect(phase(container)).toEqual({ rootFont: '16px', headings })
      assertObservedOwners()
      expect(Array.from(container.querySelectorAll('[data-testid="habit-row"]'))).toEqual(rows)
    }
    await act(async () => { document.documentElement.style.fontSize = '32px' })
    await waitFor(() => expect(phase(container)).toEqual({ rootFont: '32px', headings: [1, 1, 1] }))
    await act(async () => { document.documentElement.style.fontSize = '16px' })
    await waitFor(() => expect(phase(container)).toEqual({ rootFont: '16px', headings: [0, 0, 0] }))
    expect(recoverable).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  } finally {
    await act(async () => root?.unmount())
    expect(observations.size).toBe(0)
    container.remove()
  }
})
