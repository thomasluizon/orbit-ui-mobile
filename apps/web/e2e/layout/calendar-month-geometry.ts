import type { Page } from '@playwright/test'

export async function measureCalendarMonth(page: Page, emptyEventsLabel: string) {
  await page.getByTestId('calendar-day-card-slot').getByText(emptyEventsLabel, { exact: true }).waitFor({ state: 'visible' })
  return page.evaluate(async () => {
    await document.fonts.ready
    const measure = () => {
      const grid = document.querySelector('[data-testid="calendar-grid-card"]')!.getBoundingClientRect()
      const day = document.querySelector('[data-testid="calendar-day-card-slot"]')!
      return { gridTop: grid.top, gridHeight: grid.height, dayTop: day.getBoundingClientRect().top,
        dayHeight: day.firstElementChild!.getBoundingClientRect().height,
        figuresTop: document.querySelector('[data-testid="calendar-stats"]')!.getBoundingClientRect().top }
    }
    let previous = measure()
    let stableFrames = 0
    const deadline = performance.now() + 5_000
    while (performance.now() < deadline) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = measure()
      stableFrames = JSON.stringify(current) === JSON.stringify(previous) ? stableFrames + 1 : 0
      if (stableFrames === 2) return current
      previous = current
    }
    throw new Error('Calendar month geometry did not settle across two animation frames')
  })
}
