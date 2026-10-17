import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'

const points = mapCompletionSeries({ granularity: 'day', points: Array.from({ length: 7 }, (_, index) => ({
  startDate: `2026-09-0${index + 1}`, endDate: `2026-09-0${index + 1}`,
  completionRate: index === 0 ? null : index === 1 ? 0 : 50,
  scheduled: index === 0 ? 0 : 2, completed: index < 2 ? 0 : 1,
})) }, 'en')

function chart(series = points) {
  return <NextIntlClientProvider locale="en" messages={en}><BarChart points={series} label="Last 7 days" /></NextIntlClientProvider>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 4, 12))
  vi.stubGlobal('ResizeObserver', class {
    observe(element: HTMLElement) { this.callback([{ contentRect: { width: element.dataset.slot === 'bar-chart-readout' ? 240 : 320 } }]) }
    disconnect() {}
    constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('BarChart on web', () => {
  it('makes each full column a radio, opens on today and names its date, rate and count', () => {
    const { container } = render(chart())
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Last 7 days' })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(7)
    expect(screen.getAllByRole('row')).toHaveLength(8)
    expect(radios[3]).toHaveAttribute('aria-checked', 'true')
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([radios[3]])
    expect(radios[3]).toHaveAccessibleName(/Fri.*Sep.*4.*50%.*1 of 2/)
    expect(container.querySelector('[data-slot="bar-chart-readout"]')).toHaveTextContent(/Fri.*50%.*1 of 2/)
    expect(container.querySelectorAll('[data-state="selected"]')).toHaveLength(1)
  })

  it('selects by click and keyboard, moves focus and retains complete zero-day readouts', () => {
    const { container } = render(chart())
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0]!)
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    expect(radios[0]).toHaveAccessibleName(/Tue.*Nothing scheduled/)
    const readout = container.querySelector('[data-slot="bar-chart-readout"]')!
    const firstLeft = (readout as HTMLElement).style.left
    fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' })
    expect(radios[1]).toHaveFocus()
    expect(radios[1]).toHaveAccessibleName(/Wed.*0%.*0 of 2/)
    expect(readout).toHaveTextContent('0% · 0 of 2')
    fireEvent.keyDown(radios[1]!, { key: 'End' })
    expect(radios[6]).toHaveFocus()
    expect(radios[6]).toHaveAttribute('aria-checked', 'true')
    expect((readout as HTMLElement).style.left).not.toBe(firstLeft)
    fireEvent.keyDown(radios[6]!, { key: 'ArrowRight' })
    expect(radios[0]).toHaveFocus()
    fireEvent.keyDown(radios[0]!, { key: 'ArrowLeft' })
    expect(radios[6]).toHaveFocus()
    fireEvent.keyDown(radios[6]!, { key: 'Home' })
    fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' })
    expect(radios[1]).toHaveFocus()
    fireEvent.keyDown(radios[1]!, { key: 'ArrowUp' })
    expect(radios[0]).toHaveFocus()
  })

  it.each([
    { key: 'ArrowRight', start: 3, destinations: [4, 5] },
    { key: 'ArrowLeft', start: 3, destinations: [2, 1] },
    { key: 'ArrowDown', start: 3, destinations: [4, 5] },
    { key: 'ArrowUp', start: 3, destinations: [2, 1] },
    { key: 'ArrowRight', start: 5, destinations: [6, 0] },
    { key: 'ArrowLeft', start: 1, destinations: [0, 6] },
  ])('continues $key events on radio $start from the current selection', ({ key, start, destinations }) => {
    const { container } = render(chart())
    const radios = screen.getAllByRole('radio')
    const target = radios[start]!
    fireEvent.click(target)
    for (const destination of destinations) {
      fireEvent.keyDown(target, { key })
      const selected = radios[destination]!
      expect(screen.getAllByRole('radio', { checked: true })).toEqual([selected])
      expect(selected).toHaveFocus()
      expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([selected])
      expect(container.querySelector('[data-slot="bar-chart-readout"]')).toHaveTextContent(selected.getAttribute('aria-label')!)
      expect(screen.getAllByRole('radio')[start]).toBe(target)
    }
  })

  it('keeps selection in range when the series shrinks, and renders no control for an empty series', () => {
    const { rerender } = render(chart())
    fireEvent.click(screen.getAllByRole('radio')[6]!)
    rerender(chart(points.slice(0, 2)))
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true')
    rerender(chart([]))
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
})
