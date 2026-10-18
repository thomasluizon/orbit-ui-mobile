import { describe, expect, it } from 'vitest'
import { appConfigSchema, DEFAULT_CONFIG } from '../types/config'
import { resolveFlag } from '../utils/config'
import { createMockConfigResponse } from './factories'

describe('resolved config', () => {
  it('parses the controller response and preserves normalized client limits', () => {
    const config = appConfigSchema.parse(createMockConfigResponse(undefined, { MaxTagsPerHabit: '12' }))
    expect(config.limits).toEqual({ ...DEFAULT_CONFIG.limits, maxTagsPerHabit: 12 })
    expect(config.settings).toEqual(DEFAULT_CONFIG.settings)
    expect(config.minVersion).toBe('0.0.0')
    expect(appConfigSchema.parse(config)).toEqual(config)
  })

  it('accepts an old API response without features as all flags off', () => {
    const { features: _features, ...response } = createMockConfigResponse()
    const config = appConfigSchema.parse(response)
    expect(config.features).toEqual({})
    expect(resolveFlag(config, 'analytics')).toBe(false)
  })

  it('uses the server resolution without applying another plan check', () => {
    const config = appConfigSchema.parse(createMockConfigResponse({
      analytics: { enabled: true, planRequirement: 'Pro' },
      chat: { enabled: false, planRequirement: null },
    }))
    expect(resolveFlag(config, 'analytics')).toBe(true)
    expect(resolveFlag(config, 'chat')).toBe(false)
    expect(resolveFlag(config, 'unknown')).toBe(false)
    expect(resolveFlag(config, 'toString')).toBe(false)
    expect(resolveFlag(undefined, 'analytics')).toBe(false)
  })

  it.each([
    { ...createMockConfigResponse(), features: { analytics: { enabled: 'true', planRequirement: null } } },
    createMockConfigResponse(undefined, { MaxHabitDepth: 'invalid' }),
    { ...createMockConfigResponse(), settings: { syncIntervalSeconds: '300', syncMaxBatchSize: 100 } },
  ])('rejects malformed config', (response) => {
    expect(appConfigSchema.safeParse(response).success).toBe(false)
  })
})
