import type { Page } from '@playwright/test'

// WHY: document.fonts.ready resolves at once when no face has begun to load, and a transition that a focus or a first paint starts is still running at the next read. https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready
export async function settlePage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((face) => face.load()))
    await document.fonts.ready
    const frame = () => new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) }) })
    await frame()
    for (const animation of document.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime
      if (typeof end === 'number' && Number.isFinite(end)) animation.finish()
    }
    await frame()
  })
}
