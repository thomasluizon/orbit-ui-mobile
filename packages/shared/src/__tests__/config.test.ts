import { describe, expect, it } from 'vitest'
import { appConfigSchema, DEFAULT_CONFIG } from '../types/config'
import { isFeatureEnabled, resolveFlag } from '../utils/config'
import expectedFlags from './default-config-flags.json'
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
    expect(resolveFlag(config, 'redesign')).toBe(false)
  })

  it('uses the server resolution without applying another plan check', () => {
    const config = appConfigSchema.parse(createMockConfigResponse({
      redesign: { enabled: true, planRequirement: 'Pro' },
      ai_chat: { enabled: false, planRequirement: null },
    }))
    expect(resolveFlag(config, 'redesign')).toBe(true)
    expect(resolveFlag(config, 'ai_chat')).toBe(false)
    expect(resolveFlag(config, 'sub_habits')).toBe(false)
    expect(resolveFlag(undefined, 'redesign')).toBe(false)
  })

  it.each([
    { ...createMockConfigResponse(), features: { redesign: { enabled: 'true', planRequirement: null } } },
    createMockConfigResponse(undefined, { MaxHabitDepth: 'invalid' }),
    { ...createMockConfigResponse(), settings: { syncIntervalSeconds: '300', syncMaxBatchSize: 100 } },
  ])('rejects malformed config', (response) => {
    expect(appConfigSchema.safeParse(response).success).toBe(false)
  })
})


describe('DEFAULT_CONFIG', () => {
  it('matches the checked feature flag inventory', () => {
    expect(DEFAULT_CONFIG.features).toEqual(expectedFlags)
  })
})

describe('isFeatureEnabled', () => {
  const config = appConfigSchema.parse(createMockConfigResponse({
    sub_habits: { enabled: true, planRequirement: 'Pro' },
    goal_tracking: { enabled: true, planRequirement: null },
  }))

  it.each(['free', 'pro'] as const)('allows enabled free features for %s', (plan) => {
    expect(isFeatureEnabled(config, 'goal_tracking', plan)).toBe(true)
  })

  it.each(['free', 'pro'] as const)('checks the sub-habit plan for %s', (plan) => {
    expect(isFeatureEnabled(config, 'sub_habits', plan)).toBe(plan === 'pro')
  })

  it('keeps missing and disabled features off for Pro', () => {
    expect(isFeatureEnabled(config, 'notion_integration', 'pro')).toBe(false)
    const disabled = { ...config, features: { sub_habits: { enabled: false, planRequirement: 'Pro' } } }
    expect(isFeatureEnabled(disabled, 'sub_habits', 'pro')).toBe(false)
  })
})
