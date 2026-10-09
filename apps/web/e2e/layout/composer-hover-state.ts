import { expect, type Locator } from '@playwright/test'

export async function hoverSettledComposerControl(control: Locator) {
  await expect(control).toBeVisible()
  await expect.poll(() => control.evaluate(async (element) => {
    const ancestors: Element[] = []
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) ancestors.push(ancestor)
    const readBox = () => {
      const bounds = element.getBoundingClientRect()
      return [bounds.x, bounds.y, bounds.width, bounds.height]
    }
    const first = readBox()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const second = readBox()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const third = readBox()
    const animating = ancestors.some((ancestor) => ancestor.getAnimations().some((animation) =>
      animation.effect?.getComputedTiming().endTime !== Infinity
      && (animation.pending || animation.playState === 'running' || animation.playState === 'paused'),
    ))
    const bounds = element.getBoundingClientRect()
    return element.isConnected && bounds.width > 0 && bounds.height > 0
      && ancestors.every((ancestor) => Number(getComputedStyle(ancestor).opacity) > 0)
      && !animating && first.every((value, index) => value === second[index] && value === third[index])
      && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
  }), { message: 'the composer hover target has finished opening and holds its box across two frames' }).toBe(true)
  const bounds = (await control.boundingBox())!
  await control.page().mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect.poll(() => control.evaluate((element) => element.matches(':hover')),
    { message: 'the settled composer control matches :hover' }).toBe(true)
}
