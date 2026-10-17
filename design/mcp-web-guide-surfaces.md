# MCP web connection guide

**At a glance:** the Claude Web connection guide, its settings entry and copy states on web and Android.

The guide lives in Perfil > Astra > API keys and MCP. It follows the existing Pro and verified
step-up access rules of the section. The connection instructions open the shared sheet primitive;
closing it returns to the settings entry. No API key is needed for the OAuth connection.

| Surface | Web owner | Android owner | States |
|---|---|---|---|
| Settings entry | `apps/web/components/profile/profile-api-keys.tsx`, `profile-mcp-guide.tsx` | `apps/mobile/components/profile/profile-api-keys.tsx`, `profile-mcp-guide.tsx` | Hidden for free or unverified access; available after verification |
| Claude Web guide | `apps/web/components/profile/profile-mcp-guide.tsx` | `apps/mobile/components/profile/profile-mcp-guide.tsx` | Open, dismissing, closed; four ordered setup steps and OAuth sign-in note |
| Endpoint copy | Same guide | Same guide | Ready, pending with copy disabled, copied, error with selectable endpoint and retry; reopening resets feedback |

The existing endpoint producer supplies the URL on each platform. The sheet owns scrolling,
focus, dismissal and the pinned action row. Its body keeps the instructions and endpoint selectable.
The four setup steps and OAuth copy reuse the production translation keys in both locales.

The profile composition tests exercise the real entry and guide. Clipboard adapters remain the
browser Clipboard API and the installed native clipboard module. Web covers a rejected write and
an unavailable Clipboard API; Android covers a synchronous native bridge failure.
