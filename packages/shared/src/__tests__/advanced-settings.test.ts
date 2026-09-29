import { describe, expect, it } from 'vitest'
import {
  buildAgentScopeOptions,
  buildMcpConfigJson,
  getMcpEndpointUrl,
  MCP_CONFIG_TABS,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
} from '../utils/advanced-settings'

describe('advanced settings utils', () => {
  const productionApiBase = 'https://api.useorbit.org'

  it.each([
    ['https://api-staging.useorbit.org', 'https://api-staging.useorbit.org/mcp'],
    ['https://api-staging.useorbit.org/', 'https://api-staging.useorbit.org/mcp'],
    [productionApiBase, `${productionApiBase}/mcp`],
  ])('derives the MCP endpoint from %s', (apiBase, endpoint) => {
    expect(getMcpEndpointUrl(apiBase)).toBe(endpoint)
    expect(JSON.parse(buildMcpConfigJson(endpoint)).mcpServers.orbit.url).toBe(endpoint)
  })

  it('trims any run of trailing slashes in linear time', () => {
    const slashes = '/'.repeat(100_000)
    expect(getMcpEndpointUrl(`https://api.useorbit.org${slashes}`)).toBe('https://api.useorbit.org/mcp')
    expect(getMcpEndpointUrl(`${slashes}x${slashes}`)).toBe(`${slashes}x/mcp`)
  })

  it('defines the supported config tabs', () => {
    expect(MCP_CONFIG_TABS).toEqual(['web', 'code'])
  })

  it('groups capabilities into sorted scope options', () => {
    expect(
      buildAgentScopeOptions([
        { scope: 'habits', displayName: 'List habits' },
        { scope: 'goals', displayName: 'List goals' },
        { scope: 'habits', displayName: 'Log habit' },
      ]),
    ).toEqual([
      { scope: 'goals', label: 'goals', description: 'List goals' },
      { scope: 'habits', label: 'habits', description: 'List habits, Log habit' },
    ])
  })

  it('returns no scope options when capabilities are missing', () => {
    expect(buildAgentScopeOptions(undefined)).toEqual([])
  })

  it('defines the widget steps and features', () => {
    expect(WIDGET_STEP_KEYS).toEqual([
      'profile.widgetHow.step1',
      'profile.widgetHow.step2',
      'profile.widgetHow.step3',
    ])
    expect(WIDGET_FEATURES.map((feature) => feature.iconKey)).toEqual([
      'checkCircle',
      'clock',
      'list',
      'rotateCcw',
    ])
  })
})
