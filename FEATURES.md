# Orbit tool inventory

> **At a glance** - counts for deployed Astra and MCP tools.
> Verified against `thomasluizon/orbit-api` `main` at
> `fb61d9214db8919d5b80ece4cb885f8788ceaae9` on 2026-09-13.

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
