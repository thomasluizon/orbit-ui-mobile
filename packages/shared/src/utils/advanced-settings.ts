export const MCP_ENDPOINT_URL = 'https://api.useorbit.org/mcp'

export const MCP_CONFIG_TABS = ['web', 'desktop', 'code'] as const

export type McpConfigTab = 'web' | 'desktop' | 'code'

export function buildMcpConfigJson(apiKeyPlaceholder = 'YOUR_API_KEY'): string {
  return `{
  "mcpServers": {
    "orbit": {
      "url": "${MCP_ENDPOINT_URL}",
      "headers": {
        "Authorization": "Bearer ${apiKeyPlaceholder}"
      }
    }
  }
}`
}

export const WIDGET_STEP_KEYS = [
  'profile.widgetHow.step1',
  'profile.widgetHow.step2',
  'profile.widgetHow.step3',
] as const

export type WidgetFeatureIconKey =
  | 'checkCircle'
  | 'clock'
  | 'list'
  | 'rotateCcw'

export interface WidgetFeatureDefinition {
  iconKey: WidgetFeatureIconKey
  textKey: string
}

export const WIDGET_FEATURES: WidgetFeatureDefinition[] = [
  { iconKey: 'checkCircle', textKey: 'profile.widgetHow.feature1' },
  { iconKey: 'clock', textKey: 'profile.widgetHow.feature2' },
  { iconKey: 'list', textKey: 'profile.widgetHow.feature3' },
  { iconKey: 'rotateCcw', textKey: 'profile.widgetHow.feature4' },
]
