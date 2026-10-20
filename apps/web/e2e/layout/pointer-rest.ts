import { expect, type Locator } from '@playwright/test'

export async function restPointerOutside(group: Locator) {
  const point = await group.evaluate((element) => {
    for (const [x, y] of [
      [0, 0], [window.innerWidth - 1, 0],
      [0, window.innerHeight - 1], [window.innerWidth - 1, window.innerHeight - 1],
    ] as const) {
      const hit = document.elementFromPoint(x, y)
      if (hit && !element.contains(hit)) return { x, y }
    }
    return null
  })
  expect(point, 'a resting pointer position outside the measured group').not.toBeNull()
  await group.page().mouse.move(point!.x, point!.y)
  await expect.poll(() => group.evaluate((element, point) => ({
    pointerInside: element.contains(document.elementFromPoint(point.x, point.y)),
    hovered: element.matches(':hover'),
  }), point!)).toEqual({ pointerInside: false, hovered: false })
}
