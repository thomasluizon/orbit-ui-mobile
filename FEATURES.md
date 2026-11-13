# Orbit tool and compatibility references

> **At a glance** - counts for deployed Astra and MCP tools, and retained social compatibility references.
> Counts are pinned to `thomasluizon/orbit-api` commit
> `5fc345d2011174ddf36e56e4e08511ced08f5ef9`; recount after API changes.

## Astra AI

`orbit-api/src/Orbit.Api/Extensions/ServiceCollectionExtensions.AiServices.cs` registers
**72 `IAiTool` implementations**.

Synchronization trigger: after an `IAiTool` registration reaches deployed `orbit-api` `main`,
recount that source and update this total plus both guide locales in a paired UI pull request.

## MCP

`orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` contains
**111 `[McpServerTool]` methods across 17 tool classes**.

| Tool class | `[McpServerTool]` methods |
|---|---:|
| `AccountTools.cs` | 2 |
| `AgentTools.cs` | 9 |
| `ApiKeyTools.cs` | 3 |
| `CalendarTools.cs` | 5 |
| `ChecklistTemplateTools.cs` | 5 |
| `FeatureFlagTools.cs` | 2 |
| `FeatureTools.cs` | 2 |
| `GamificationTools.cs` | 4 |
| `GoalTools.cs` | 12 |
| `HabitTools.cs` | 30 |
| `NotificationTools.cs` | 8 |
| `NotionTools.cs` | 2 |
| `ProfileTools.cs` | 9 |
| `RecordPageTools.cs` | 5 |
| `SubscriptionTools.cs` | 5 |
| `SupportTools.cs` | 2 |
| `TagTools.cs` | 6 |

Synchronization trigger: after an `[McpServerTool]` method reaches deployed `orbit-api` `main`,
recount every tool class and update this table, its total, and both guide locales in a paired UI pull request.

## Retained social references

The social hub, feed, friends, cheers, cooperative challenges, and accountability pairs
have no client screens or actions on either platform. Sharing and referrals remain available.
The generated server contract and optional `socialOptIn` profile field remain for API
compatibility; neither exposes a social capability in the clients.

Earned achievements remain viewable after a capability is retired. The `team_player`,
`mission_accomplished`, and `battle_buddy` achievement names and descriptions stay in both
`en` and `pt-BR`, and the `Social` category remains supported. Both achievement screens resolve
copy by achievement ID, so removing these keys would break the display of earned badges.

Notifications targeting `/social`, `/public-profile`, or `/u/` are hidden from both inboxes
and their unread badges. The retired URLs remain in regression fixtures to verify that
stored notifications cannot restore removed destinations and that bulk mark-read still works.
