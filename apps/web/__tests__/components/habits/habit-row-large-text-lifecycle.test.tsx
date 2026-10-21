import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { HabitTextScaleFixture } from '../../support/habit-text-scale-fixture'

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('font-size')
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
