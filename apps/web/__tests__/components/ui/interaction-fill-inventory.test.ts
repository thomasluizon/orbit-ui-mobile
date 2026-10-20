import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { inspectControls } from '@/e2e/layout/interaction-fill-states'
import { captureControlInventory } from '@/e2e/layout/interaction-fill-inventory'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('interaction fill inventory after a layer closes', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['clear', 'collision', 'missing'] as const)('visits recreated controls by accessible identity and order: %s', async outcome => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin:0 } section { padding:32px;display:flex;flex-direction:column;gap:32px }
        button, textarea { position:relative;padding:8px;border:0;outline:none;background:gray;width:160px;height:48px }
        [role="dialog"] { position:fixed;inset:0;background:white;padding:32px }
        p { margin:0 } [data-collision]::before { content:'';position:absolute;inset:0 0 -36px;background:gray }
      </style><section><textarea aria-label="Message"></textarea><div id="actions" style="display:contents"></div><p>Neighbour</p></section>`)
      await page.evaluate(outcome => {
        const pressed: string[] = []
        const actions = document.querySelector('#actions')!
        function renderActions(restored: boolean) {
          actions.replaceChildren()
          for (const slot of ['first', 'second']) {
            if (restored && outcome === 'missing' && slot === 'second') continue
            const button = document.createElement('button')
            button.type = 'button'
            button.setAttribute('aria-labelledby', `${slot}-label`)
            const label = document.createElement('span')
            label.id = `${slot}-label`
            label.textContent = 'Repeat: "quoted"'
            button.append(label)
            if (restored && outcome === 'collision' && slot === 'second') button.dataset.collision = ''
            button.addEventListener('pointerdown', () => {
              pressed.push(slot)
              document.body.dataset.pressed = JSON.stringify(pressed)
            })
            actions.append(button)
          }
        }
        renderActions(false)
        document.querySelector('textarea')!.addEventListener('focus', () => {
          const section = document.querySelector('section')!
          section.style.visibility = 'hidden'
          const dialog = document.createElement('div')
          dialog.setAttribute('role', 'dialog')
          dialog.innerHTML = '<textarea aria-label="Conversation message"></textarea>'
          document.body.append(dialog)
          dialog.querySelector('textarea')!.focus()
          document.addEventListener('keydown', function close(event) {
            if (event.key !== 'Escape') return
            renderActions(true)
            dialog.remove()
            section.style.visibility = ''
            document.removeEventListener('keydown', close)
          })
        })
      }, outcome)
      const controls = page.locator('section :is(button, textarea):visible')
      const inventory = await captureControlInventory(controls)
      expect(inventory.map(({ identity, order }) => ({ identity, order }))).toEqual([
        { identity: 'textbox "Message"', order: 0 },
        { identity: 'button "Repeat: \\"quoted\\""', order: 0 },
        { identity: 'button "Repeat: \\"quoted\\""', order: 1 },
      ])
      const counts = { inspectedControls: 0, skippedSentinels: 0 }
      const inspection = inspectControls(page, controls, '/, 320px, en', INTERACTION_FILL_CLEARANCE, counts)
      if (outcome === 'clear') {
        await inspection
        expect(counts).toEqual({ inspectedControls: 3, skippedSentinels: 0 })
        expect(await page.locator('body').getAttribute('data-pressed')).toBe('["first","second"]')
      } else {
        await expect(inspection).rejects.toThrow(outcome === 'collision' ? /hover[\s\S]*p\[Neighbour\]/ : /missing button.*occurrence 1/)
        expect(counts).toEqual({ inspectedControls: 2, skippedSentinels: 0 })
      }
    } finally { await page.close() }
  })
})
