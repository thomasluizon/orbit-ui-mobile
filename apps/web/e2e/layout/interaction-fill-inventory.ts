import { expect, type Locator, type Page } from '@playwright/test'
import { parse } from 'yaml'

const INVENTORY_TIMEOUT_MS = 2000

async function controlIdentity(control: Locator) {
  const snapshot: unknown = parse(await control.ariaSnapshot({ timeout: INVENTORY_TIMEOUT_MS }))
  if (snapshot === null || Array.isArray(snapshot) && snapshot.length === 0) return 'none'
  if (!Array.isArray(snapshot)) throw new Error(`Unrecognized control accessibility snapshot: ${JSON.stringify(snapshot)}`)
  const first: unknown = snapshot[0]
  const label = typeof first === 'string' ? first
    : first && typeof first === 'object' ? Object.keys(first)[0] : undefined
  const identity = label?.match(/^[a-z]+(?: "(?:[^"\\]|\\.)*")?/)?.[0]
  if (!identity) throw new Error(`Unrecognized control accessibility snapshot: ${JSON.stringify(snapshot)}`)
  return identity
}

export async function captureControlInventory(controls: Locator, context = 'interaction fill inventory') {
  const identities = new Map<string, number>()
  const inventory = []
  for (const [index, control] of (await controls.all()).entries()) {
    try {
      const identity = await controlIdentity(control)
      const order = identities.get(identity) ?? 0
      identities.set(identity, order + 1)
      const title = await control.evaluate(element => element.matches('.orbit-habit-rename'), undefined, { timeout: INVENTORY_TIMEOUT_MS })
      inventory.push({ index, identity, order, title })
    } catch (cause) {
      throw new Error(`${context}, control ${index}: cannot capture control identity`, { cause })
    }
  }
  return inventory
}

export async function resolveCapturedControl(page: Page, controls: Locator,
  entry: Awaited<ReturnType<typeof captureControlInventory>>[number], context: string) {
  const captured = page.locator(`[data-interaction-fill-probe="${entry.index}"]`)
  if (await captured.count() === 0) {
    const recaptured = await captureControlInventory(controls, context)
    const replacement = recaptured.find(candidate => candidate.identity === entry.identity && candidate.order === entry.order)
    expect(replacement, `${context}: missing ${entry.identity}, occurrence ${entry.order}`).toBeDefined()
    await controls.nth(replacement!.index).evaluate((element, index) => {
      element.setAttribute('data-interaction-fill-probe', String(index))
    }, entry.index, { timeout: INVENTORY_TIMEOUT_MS })
  }
  await expect(captured, `${context}: ${entry.identity}, occurrence ${entry.order}`).toHaveCount(1, { timeout: INVENTORY_TIMEOUT_MS })
  return captured
}
