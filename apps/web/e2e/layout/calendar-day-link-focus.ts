import { expect, type Locator } from '@playwright/test'
import { readOutlineVisibility } from './focus-indicators'

export async function expectCalendarDayLinkFocus(link: Locator) {
  await expect(async () => {
    await expect(link).toBeVisible()
    await link.focus()
    await link.page().keyboard.press('Shift+Tab')
    await link.page().keyboard.press('Tab')
    expect(await link.evaluate((element) => document.activeElement === element), 'the keyboard traversal focuses the current day link').toBe(true)
    await expect(link).toHaveCSS('border-top-left-radius', '12px')
    const outline = await readOutlineVisibility(link)
    expect(outline.visible).toBe(true)
    expect(outline.clippedBy).toEqual([])
  }).toPass({ timeout: 15_000 })
}
