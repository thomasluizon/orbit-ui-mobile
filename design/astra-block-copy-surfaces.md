> **At a glance** - Astra code-block copy controls, platform owners, states and verification boundaries.

# Astra block copying

The conversation keeps text selectable. Only fenced and indented code blocks in Astra replies carry a copy control. The control occupies a separate trailing row above the block.

| Surface | Web owner | Android owner | States and coverage |
|---|---|---|---|
| Astra reply with one block | `components/chat/message-bubble.tsx`, `components/ui/markdown.tsx` | `components/message-bubble.tsx`, `components/ui/markdown.tsx` | Fenced text, whitespace, Unicode and literal markup copy without fences. |
| Astra reply with multiple blocks | Same owners | Same owners | Fenced and indented blocks each get one independent control. Nested blocks retain their prose context. |
| Copy control | `components/ui/block-copy-control.tsx` | `components/ui/block-copy-control.tsx` | Rest, hover, press, focus, copied, timeout, clipboard failure and retry. The shared small Button owns the touch floor and interaction fills. |
| Astra reply without a block | Same message and Markdown owners | Same message and Markdown owners | Prose and inline code carry no control. |
| User message | Same message and Markdown owners | Same message and Markdown owners | Code and prose stay selectable with no copy control. |
| Non-conversation descriptions | `components/ui/markdown.tsx` | `components/ui/markdown.tsx` | Copying is opt-in at the Astra reply owner; description callers retain their renderer. |

Both locale catalogs own the control's label, copied confirmation and retry message. Confirmation changes the visible label and updates a stable polite live region. Errors remain visible until retry. The confirmation resets after five seconds. Appending streamed prose retains each unchanged block control, its live region and its feedback; web keyboard focus stays on that control.

Web Chromium Vitest cases use the production stylesheet, theme variables and fonts at 320 and 1352, both themes and locales, with normal and doubled text. Native Vitest drives the actual Markdown parser and message composition; it does not measure Android text or prove TalkBack delivery. Device inspection remains part of the whole-redesign review.
