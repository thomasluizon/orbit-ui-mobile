# MCP web connection guide

**At a glance:** the Claude Web connection guide, its client selector, settings entry and copy states on web and Android.

The guide lives in Perfil > Astra > API keys and MCP. It follows the existing Pro and verified
step-up access rules of the section. The client selector retains the Claude Code JSON configuration
and its copy action. The Claude Web tab keeps the endpoint and OAuth note; its connection
instructions open the shared sheet primitive;
closing it returns to the settings entry. No API key is needed for the OAuth connection.

| Surface | Web owner | Android owner | States |
|---|---|---|---|
| Settings entry | `apps/web/components/profile/profile-api-keys.tsx`, `mcp-code-client.tsx`, `profile-mcp-guide.tsx` | `apps/mobile/components/profile/profile-api-keys.tsx`, `mcp-code-client.tsx`, `profile-mcp-guide.tsx` | Hidden for free or unverified access; available after verification |
| Claude Web guide | `apps/web/components/profile/profile-mcp-guide.tsx` | `apps/mobile/components/profile/profile-mcp-guide.tsx` | Open, dismissing, closed; four ordered setup steps and OAuth sign-in note |
| Endpoint copy | Same guide | Same guide | Ready, pending with copy disabled, copied, error with selectable endpoint and retry; reopening resets feedback |

The existing endpoint producer supplies the URL on each platform. The sheet owns scrolling,
focus, dismissal and the pinned action row. Its body keeps the instructions and endpoint selectable.
The four setup steps and OAuth copy reuse the production translation keys in both locales.

The profile composition tests exercise the real entry and guide. Clipboard adapters remain the
browser Clipboard API and the installed native clipboard module. Web awaits the write acknowledgement
and covers a rejected write and an unavailable Clipboard API. Android confirms the endpoint through
clipboard read-back before reporting success. Its coverage includes a synchronous bridge failure,
a normally returning write that leaves previous content, a rejected read, retry and pending confirmation.

Client-selector composition tests switch through Claude Code, open and dismiss the Claude Web guide,
then return to the unchanged JSON configuration. Web runs this path in both supported locales.
