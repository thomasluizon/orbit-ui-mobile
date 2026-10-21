import { expect } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { completeInstallOnboarding } from './install-onboarding'
import { test } from './layout-test'
import { inspectControls } from './interaction-fill-states'
import { captureControlInventory } from './interaction-fill-inventory'
import { layoutRouteInventory } from './layout-route-inventory'
import { installInteractionFillFixtures } from './interaction-fill-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

for (const change of ['remove', 'add', 'replace'] as const) {
  test(`interaction fill inventory settles after controls ${change} during capture`, async ({ page }) => {
    await page.setContent('<button>First</button><button>Second</button>')
    const controls = page.locator('button')
    const nth = controls.nth.bind(controls)
    const failures: string[] = []
    let changed = false
    controls.nth = index => {
      const control = nth(index)
      const ariaSnapshot = control.ariaSnapshot.bind(control)
      control.ariaSnapshot = async options => {
        let snapshot: string
        try { snapshot = await ariaSnapshot(options) }
        catch (cause) { failures.push(String(cause)); throw cause }
        if (index === 0 && !changed) {
          changed = true
          await page.evaluate(change => {
            if (change === 'remove') document.body.innerHTML = '<button class="orbit-habit-rename">Replacement</button>'
            if (change === 'add') document.body.insertAdjacentHTML('beforeend', '<button>Added</button>')
            if (change === 'replace') document.body.innerHTML = '<button>Replacement</button><button>Second</button>'
          }, change)
        }
        return snapshot
      }
      return control
    }
    const expected = change === 'remove'
      ? [{ index: 0, identity: 'button "Replacement"', order: 0, title: true }]
      : [
        { index: 0, identity: `button "${change === 'replace' ? 'Replacement' : 'First'}"`, order: 0, title: false },
        { index: 1, identity: 'button "Second"', order: 0, title: false },
      ]
    if (change === 'add') expected.push({ index: 2, identity: 'button "Added"', order: 0, title: false })
    expect(await captureControlInventory(controls, '/habits/new, 320px, en')).toEqual(expected)
    await expect(controls).toHaveCount(expected.length)
    expect(failures.join('\n')).not.toContain('Timeout')
  })
}

for (const width of [320, 412, 600, 1024, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`interaction fill clearance at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, contextOptions: { reducedMotion: 'reduce' } })
      for (const { path: route, hasControls } of layoutRouteInventory) {
        test(`${route} keeps fills clear of neighbours`, async ({ page, context }) => {
          test.setTimeout(120_000)
          await installInteractionFillFixtures(context, route, locale)
          if (route !== '/onboarding') await completeInstallOnboarding(page)
          if (route === '/login') await context.clearCookies({ name: /^(auth_token|refresh_token)$/ })
          await page.goto(route)
          await page.evaluate(() => document.fonts.ready)
          if (hasControls) await expect(page.locator('h1:visible').first()).toBeVisible()
          if (route === '/chat') await expect(page.getByRole('button', { name: (locale === 'en' ? en : ptBR).common.closeConversation })).toBeVisible()
          if (route === '/habits/habit-1') await expect(page.locator('.orbit-habit-rename')).toBeVisible()
          if (route === '/progress') await expect(page.getByTestId('bar-chart').getByRole('radio')).toHaveCount(30)
          const controls = page.locator(':is(button, a[href], input, textarea, select, summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [tabindex="0"]):visible:not(:disabled):not([aria-disabled="true"])')
          const count = await controls.count()
          if (hasControls) expect(count, `${route} control inventory`).toBeGreaterThan(0)
          const counts = { inspectedControls: 0, skippedSentinels: 0 }
          try {
            await inspectControls(page, controls, `${route}, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE, counts)
            if (route === '/calendar') {
              await page.getByRole('radio', { name: (locale === 'en' ? en : ptBR).calendar.view.week, exact: true }).click()
              await page.locator('[data-interaction-fill-probe]').evaluateAll((elements) => elements.forEach((element) => element.removeAttribute('data-interaction-fill-probe')))
              const headers = page.getByTestId('time-grid-col-header')
              await expect(headers).toHaveCount(7)
              await inspectControls(page, headers, `calendar week header, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE, counts)
            }
          } finally {
            test.info().annotations.push({ type: 'interaction fill inventory', description: JSON.stringify(counts) })
          }
        })
      }
    })
  }
}
