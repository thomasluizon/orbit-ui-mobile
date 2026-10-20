import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('layout origin configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('LAYOUT', '1')
    vi.stubEnv('PORT', '4200')
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each([
    [undefined, '3000'],
    ['3100', '3100'],
  ])('uses LAYOUT_PORT=%s for the origin and web server', async (port, expectedPort) => {
    vi.stubEnv('LAYOUT_PORT', port)
    const { LAYOUT_ORIGIN } = await import('../../e2e/support/env')
    const { default: config } = await import('../../playwright.config')
    const expectedOrigin = `http://127.0.0.1:${expectedPort}`

    expect(LAYOUT_ORIGIN).toBe(expectedOrigin)
    expect(config.use?.baseURL).toBe(expectedOrigin)
    expect(config.webServer).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: 'npm run start',
        url: expectedOrigin,
        reuseExistingServer: false,
        env: expect.objectContaining({ PORT: expectedPort, NEXT_PUBLIC_SITE_URL: expectedOrigin }),
      }),
    ]))
    expect(config.projects?.find(project => project.name === 'layout')?.use?.baseURL).toBe(expectedOrigin)
  })

  it('keeps smoke runs on their configured deployment without local servers', async () => {
    vi.stubEnv('LAYOUT', undefined)
    vi.stubEnv('LAYOUT_PORT', '3100')
    vi.stubEnv('SMOKE_BASE_URL', 'https://smoke.example.com')
    const { default: config } = await import('../../playwright.config')

    expect(config.use?.baseURL).toBe('https://smoke.example.com')
    expect(config.webServer).toBeUndefined()
  })

  it('still rejects a smoke run without its deployment origin', async () => {
    vi.stubEnv('LAYOUT', undefined)
    vi.stubEnv('SMOKE_BASE_URL', undefined)

    await expect(import('../../playwright.config')).rejects.toThrow('SMOKE_BASE_URL is required')
  })
})
