import type { Locator } from '@playwright/test'

export async function settleAstraTurn(turn: Locator) {
  await turn.evaluate(async article => {
    await document.fonts.ready
    await Promise.all(article.getAnimations({ subtree: true }).map(animation => animation.finished))
  })
}
