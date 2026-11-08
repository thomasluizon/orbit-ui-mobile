import { describe, expect, it, vi } from 'vitest'
import { CalendarEntryDetails } from '@/app/(tabs)/calendar/_components/calendar-entry-details'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { measureStartEdgeIconAction } from '@/__tests__/support/start-edge-icon-action'

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

describe('calendar entry search empty state icon action', () => {
  it('centres the clear glyph in its paint and starts it on the message column', async () => {
    let tree!: ReactTestRenderer & Parameters<typeof measureStartEdgeIconAction>[0]
    await act(() => { tree = create(<CalendarEntryDetails entries={[]} title="Entries" displayTime={(time) => time} onClose={vi.fn()} />) as typeof tree })
    try {
      const geometry = measureStartEdgeIconAction(tree, 364, 'calendar.dayDetail.clearEventSearch')
      const detail = JSON.stringify(geometry)
      expect(geometry.texts.length, detail).toBe(1)
      expect(geometry.paint.width, detail).toBe(44)
      expect(geometry.targetWidth, detail).toBe(48)
      expect(Math.abs((geometry.glyph.left + geometry.glyph.right) / 2 - (geometry.paint.left + geometry.paint.right) / 2), detail).toBeLessThanOrEqual(0.5)
      expect(Math.abs(geometry.glyph.left - geometry.texts[0]!.left), detail).toBeLessThanOrEqual(0.5)
    } finally { await act(() => tree.unmount()) }
  })
})
