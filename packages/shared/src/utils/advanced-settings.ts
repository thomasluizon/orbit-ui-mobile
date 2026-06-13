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

export interface AgentScopeOption {
  scope: string
  label: string
  description: string
}

/**
 * Groups agent capabilities by scope into the option list rendered by the
 * create-API-key modal: one entry per scope, description listing the display
 * names of every capability in that scope, sorted by scope name.
 */
export function buildAgentScopeOptions(
  capabilities: readonly { scope: string; displayName: string }[] | undefined,
): AgentScopeOption[] {
  const grouped = new Map<string, string[]>()

  for (const capability of capabilities ?? []) {
    const descriptions = grouped.get(capability.scope) ?? []
    descriptions.push(capability.displayName)
    grouped.set(capability.scope, descriptions)
  }

  return Array.from(grouped.entries())
    .map(([scope, labels]) => ({
      scope,
      label: scope,
      description: labels.join(', '),
    }))
    .sort((left, right) => left.scope.localeCompare(right.scope))
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
