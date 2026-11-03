import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs() })

it('disables setup traces while retaining failure screenshots and video', async () => {
  vi.stubEnv('SMOKE_BASE_URL', 'https://smoke.example.test')
  const { default: config } = await import('../../playwright.config')
  const setup = config.projects?.find((project) => project.name === 'setup')
  expect(setup).toBeDefined()
  expect(setup?.use?.trace).toBe('off')
  expect(setup?.use?.screenshot ?? config.use?.screenshot).toBe('only-on-failure')
  expect(setup?.use?.video ?? config.use?.video).toBe('retain-on-failure')
})
