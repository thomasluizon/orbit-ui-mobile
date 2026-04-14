import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookiesMock = vi.fn()
const headersMock = vi.fn()

vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: () => Promise<unknown>) => factory,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
  headers: headersMock,
}))

describe('web i18n request config', () => {
  beforeEach(() => {
    vi.resetModules()
    cookiesMock.mockReset()
    headersMock.mockReset()
  })

  it('honors an explicit english locale cookie before Accept-Language', async () => {
    cookiesMock.mockResolvedValue({
      get: (key: string) => (key === 'i18n_locale' ? { value: 'en' } : undefined),
    })
    headersMock.mockResolvedValue(
      new Headers({ 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' }),
    )

    const getRequestConfig = (await import('@/i18n/request')).default
    const result = await getRequestConfig()

    expect(result.locale).toBe('en')
  })

  it('falls back to the system locale when there is no supported locale cookie', async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    })
    headersMock.mockResolvedValue(
      new Headers({ 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' }),
    )

    const getRequestConfig = (await import('@/i18n/request')).default
    const result = await getRequestConfig()

    expect(result.locale).toBe('pt-BR')
  })
})
