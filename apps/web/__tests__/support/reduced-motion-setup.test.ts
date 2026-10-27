import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const originalMatchMedia = window.matchMedia

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.unstubAllGlobals()
  window.matchMedia = originalMatchMedia
})

it('loads the shared setup when the test environment has no window', async () => {
  vi.stubGlobal('window', undefined)
  await expect(import('./reduced-motion-setup')).resolves.toBeDefined()
})

it('enables reduced motion only for its media query in a browser environment', async () => {
  await import('./reduced-motion-setup')
  expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
  expect(window.matchMedia('(prefers-reduced-motion: no-preference)').matches).toBe(false)
  expect(window.matchMedia('(min-width: 768px)').matches).toBe(false)
})
