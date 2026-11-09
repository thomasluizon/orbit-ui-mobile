import type { Browser } from './chromium'

type Page = Awaited<ReturnType<Browser['newPage']>>

/** Reads a start-edge icon action, the text block before it and the nearest ancestor that clips it horizontally. */
export async function measureStartEdgeIconAction(page: Page, label: string) {
  const geometry = await page.locator(`button[aria-label="${label}"]`).evaluate((button) => {
    const box = (element: Element) => {
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
    }
    let clip = button.parentElement
    while (clip && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
    return {
      text: box(button.previousElementSibling!),
      paint: box(button),
      glyph: box(button.querySelector('svg')!),
      hitExtension: -Number.parseFloat(getComputedStyle(button, '::after').left),
      clipLeft: clip ? clip.getBoundingClientRect().left + clip.clientLeft : 0,
    }
  })
  const centre = (low: number, high: number) => (low + high) / 2
  return {
    geometry,
    paintWidth: geometry.paint.right - geometry.paint.left,
    targetWidth: geometry.paint.right - geometry.paint.left + 2 * geometry.hitExtension,
    glyphCentreOffset: {
      x: Math.abs(centre(geometry.glyph.left, geometry.glyph.right) - centre(geometry.paint.left, geometry.paint.right)),
      y: Math.abs(centre(geometry.glyph.top, geometry.glyph.bottom) - centre(geometry.paint.top, geometry.paint.bottom)),
    },
    glyphTextOffset: Math.abs(geometry.glyph.left - geometry.text.left),
    gutter: geometry.text.left - geometry.clipLeft,
    targetStartClearance: geometry.paint.left - geometry.hitExtension - geometry.clipLeft,
  }
}
