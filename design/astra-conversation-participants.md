# Astra conversation participants

**At a glance:** participant avatar owners, content alignment, state coverage and the pending
reply integration seam on web and Android.

## Surface inventory

| Surface | Web owner | Android owner | Coverage |
|---|---|---|---|
| Conversation feed | `apps/web/components/chat/conversation.tsx` | `apps/mobile/components/chat/conversation.tsx`, `conversation.styles.ts` | First Astra message, consecutive Astra messages, user messages and a new Astra run after a user message |
| Reply content column | `apps/web/components/chat/message-bubble.tsx` within the feed | `apps/mobile/components/message-bubble.tsx` within the feed | Multi-paragraph prose, streaming prose, block-only replies, previews, clarification, breakdown, outcomes, actions, read lists and metrics |
| Reply adjuncts | Conversation feed | Conversation feed | Running and completed tool traces and follow-up actions share the reply content edge |
| Empty conversation | `apps/web/components/chat/chat-empty-state.tsx` | `apps/mobile/components/chat/chat-empty-state.tsx` | Retains the existing empty-state mark; no participant avatar without a message or running tool activity |

Both shell layouts mount this conversation once: `apps/web/app/(app)/layout.tsx` and
`apps/mobile/app/_layout.tsx`. Entry points share these owners. No new route, sheet or dialog is
introduced. Error and terminal blocks remain in the reply content column. The person's sent and
attachment bubbles remain right aligned without an avatar column.

## Geometry

The thread inset is 16. Astra's leading column is 24, followed by an 8 gap. A run's first
message shows `AstraGlyph` in `fg-1`; each continuation reserves the column without another mark.
The content can shrink and wrap, and its blocks keep the existing 16 gaps. Web prose retains
its 65ch cap. The mark is decorative for assistive technology because each message already
identifies its sender. A running tool trace uses the same row and content column as a completed
reply. It shows the mark after a user message or in an empty thread, and reserves the column
without another mark after an Astra message.

The pending reply from #1402 shares this geometry: mark at the thread inset, indicator at the
content edge, both starting in the same 24-high row as the first reply. Its implementation is
carried separately in ui#1756. The pull request that merges second aligns that pending row with
the turn rendering. Shared files are both platforms' `components/chat/conversation.tsx`,
`apps/web/__tests__/components/chat/message-block-layout.test.tsx`, `DESIGN.md` and `CLAUDE.md`.

## Verification owners

Both platforms' `__tests__/components/chat/message-block-layout.test.tsx` mount the conversation
with representative message and block fixtures. Cases at 412 and 1352 verify run boundaries,
the absence of user avatars, the avatar dimensions and the shared text and block edge. Active tool
cases cover empty threads and user or Astra predecessors, then complete the reply and compare
the trace and prose edges. Web
measures compiled styles in hermetic Chromium through Vitest; Android measures its rendered
native styles through Yoga. The wider block matrix also covers both locales, block-only replies,
previews, read lists, metrics, clarification, outcomes and actions.
