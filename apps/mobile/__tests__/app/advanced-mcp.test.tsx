import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMcpEndpointUrl } from '@orbit/shared/utils/advanced-settings'

describe('MCP endpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires an explicit API base in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('EXPO_PUBLIC_API_BASE', undefined)
    vi.resetModules()

    await expect(import('@/lib/api-base')).rejects.toThrow('EXPO_PUBLIC_API_BASE')
  })

  it('derives the selected API endpoint for profile settings', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE', 'https://api-staging.useorbit.org/')
    vi.resetModules()
    const { API_BASE } = await import('@/lib/api-base')

    expect(getMcpEndpointUrl(API_BASE)).toBe('https://api-staging.useorbit.org/mcp')
  })
})
