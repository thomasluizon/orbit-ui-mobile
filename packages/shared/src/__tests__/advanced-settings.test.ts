import { describe, expect, it } from 'vitest'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
} from '../utils/advanced-settings'

describe('advanced settings utils', () => {
  it('keeps the shared mcp endpoint stable', () => {
    expect(MCP_ENDPOINT_URL).toBe('https://api.useorbit.org/mcp')
    expect(buildMcpConfigJson()).toContain(MCP_ENDPOINT_URL)
  })

  it('defines the supported config tabs', () => {
    expect(MCP_CONFIG_TABS).toEqual(['web', 'desktop', 'code'])
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
