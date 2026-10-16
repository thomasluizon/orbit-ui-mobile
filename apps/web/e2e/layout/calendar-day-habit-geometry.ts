import { expect, type Locator } from '@playwright/test'

export async function expectCalendarDayHabitRows(
  card: Locator,
  entries: readonly { title: string; dueTime: string | null }[],
  noSetTime: string,
  scale: number,
): Promise<number[]> {
  let heights: number[] = []
  await expect(async () => {
    await card.page().evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
    await card.page().evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))))
    await card.page().evaluate(async () => { await document.fonts.ready })
    const rows = await card.evaluate((element) => [...element.querySelectorAll<HTMLElement>('[data-personal-text]')].map((title) => {
      const button = (title.closest('[data-personal-text-action]')?.querySelector('button') ?? title.closest('button'))!
      const row = button.closest('[data-slot="list-row-body"]') ?? button
      const rowBox = row.getBoundingClientRect()
      const titleBox = title.getBoundingClientRect()
      const metadata = title.nextElementSibling as HTMLElement | null
      const metadataBox = metadata?.getBoundingClientRect()
      return {
        title: title.textContent, accessibleName: button.getAttribute('aria-label'), height: rowBox.height, minimum: Number.parseFloat(getComputedStyle(row).minHeight),
        metadata: metadata?.textContent, metadataSize: metadata ? Number.parseFloat(getComputedStyle(metadata).fontSize) : null,
        gap: metadataBox ? metadataBox.top - titleBox.bottom : null,
        contained: metadataBox ? metadataBox.bottom <= rowBox.bottom && metadataBox.left >= rowBox.left && metadataBox.right <= rowBox.right : false,
        clipped: !metadata || metadata.scrollHeight > metadata.clientHeight || metadata.scrollWidth > metadata.clientWidth,
      }
    }))
    expect(rows).toHaveLength(entries.length)
    for (const entry of entries) {
      const row = rows.find((row) => row.title === entry.title)!
      expect(row.minimum, JSON.stringify(row)).toBe(68)
      expect(row.accessibleName).toContain(entry.title)
      expect(row.height).toBeGreaterThanOrEqual(68)
      expect(row.metadata).toBe(entry.dueTime ?? noSetTime)
      expect(row.metadataSize).toBe(12 * scale)
      expect(row.gap).toBeCloseTo(4)
      expect(row.contained).toBe(true)
      expect(row.clipped).toBe(false)
    }
    heights = entries.map((entry) => rows.find((row) => row.title === entry.title)!.height)
  }).toPass({ timeout: 15_000 })
  return heights
}
