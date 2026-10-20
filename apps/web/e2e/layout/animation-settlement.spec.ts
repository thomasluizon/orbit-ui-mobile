import { expect } from '@playwright/test'
import { test } from './upgrade-fixtures'
import { prepareAnimationSettlementScenario } from './animation-settlement-scenario'
import { settleAnimations } from './settle-animations'

for (const mode of ['cancel', 'replace', 'replay'] as const) {
  test(`settles a running CSS transition after ${mode}`, async ({ page }) => {
    expect(await page.evaluate(prepareAnimationSettlementScenario, mode)).toEqual({ kind: 'CSSTransition', state: 'running' })
    const scope = page.locator('#animation-settlement')
    await scope.evaluate(settleAnimations)
    await expect(scope).toHaveAttribute('data-settled', 'true')
    expect(Number(await scope.getAttribute('data-reads'))).toBeGreaterThanOrEqual(mode === 'cancel' ? 2 : 3)
  })
}
