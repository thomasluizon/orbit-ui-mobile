# Orbit tool and compatibility references

> **At a glance** - counts for deployed Astra and MCP tools, and retained social compatibility references.
> Counts are pinned to `thomasluizon/orbit-api` commit
> `fb61d9214db8919d5b80ece4cb885f8788ceaae9`; recount after API changes.

## Astra AI

`orbit-api/src/Orbit.Api/Extensions/ServiceCollectionExtensions.AiServices.cs` registers
**63 `IAiTool` implementations**.

Synchronization trigger: after an `IAiTool` registration reaches deployed `orbit-api` `main`,
recount that source and update this total plus both guide locales in a paired UI pull request.

## MCP

`orbit-api/src/Orbit.Api/Mcp/Tools/*.cs` contains
**81 `[McpServerTool]` methods across 15 tool classes**.

| Tool class | `[McpServerTool]` methods |
|---|---:|
| `AccountTools.cs` | 1 |
| `AgentTools.cs` | 8 |
| `ApiKeyTools.cs` | 2 |
| `CalendarTools.cs` | 2 |
| `ChecklistTemplateTools.cs` | 3 |
| `FeatureTools.cs` | 1 |
| `GamificationTools.cs` | 3 |
| `GoalTools.cs` | 11 |
| `HabitTools.cs` | 24 |
| `NotificationTools.cs` | 7 |
| `ProfileTools.cs` | 7 |
| `SubscriptionTools.cs` | 4 |
| `SupportTools.cs` | 1 |
| `TagTools.cs` | 5 |
| `UserFactTools.cs` | 2 |

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
