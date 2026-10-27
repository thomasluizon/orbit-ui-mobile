# Astra conversation participants

**At a glance:** participant avatar owners, content alignment, state coverage and the pending
reply replacement on web and Android.

## Surface inventory

| Surface | Web owner | Android owner | Coverage |
|---|---|---|---|
| Conversation feed | `apps/web/components/chat/conversation.tsx` | `apps/mobile/components/chat/conversation.tsx`, `conversation.styles.ts` | First Astra message, consecutive Astra messages, user messages and a new Astra run after a user message |
| Reply content column | `apps/web/components/chat/message-bubble.tsx` within the feed | `apps/mobile/components/message-bubble.tsx` within the feed | Multi-paragraph prose, streaming prose, block-only replies, previews, clarification, breakdown, outcomes, actions, read lists and metrics |
| Reply adjuncts | Conversation feed | Conversation feed | Running and completed tool traces and follow-up actions share the reply content edge |
| Empty conversation | `apps/web/components/chat/chat-empty-state.tsx` | `apps/mobile/components/chat/chat-empty-state.tsx` | Retains the existing empty-state mark; no participant avatar without a message, pending reply or running tool activity |

Both shell layouts mount this conversation once: `apps/web/app/(app)/layout.tsx` and
`apps/mobile/app/_layout.tsx`. Entry points share these owners. No new route, sheet or dialog is
introduced. Error and terminal blocks remain in the reply content column. The person's sent and
attachment bubbles remain right aligned without an avatar column.

## Geometry

The thread inset is 16. A run's first message shows a 24px `AstraGlyph` in `fg-1` on its own
row, followed by an 8px gap above the first content. Each continuation has no mark or reserved
avatar space. Prose and blocks share the composer's leading edge; blocks fill its trailing edge.
The content can shrink and wrap, and its blocks keep the existing 16 gaps. Web prose retains
its 65ch cap. The mark is decorative for assistive technology because each message already
identifies its sender. A running tool trace uses the same mark row and full content column as a completed
reply. It shows the mark after a user message or in an empty thread, and omits the mark row after an Astra message.

The pending reply shares this geometry: mark row at the thread inset when starting an Astra
run, then an 8px gap before the indicator at the same content edge as the first reply. Pending,
running tool activity and completed content use the same run boundary. The pending indicator is
replaced immediately. New replies and their blocks rise and fade with the shared conversation
tokens while remaining visible and actionable. History stays still. The stable polite working
announcement remains outside the busy feed.

## Verification owners

Both platforms' `__tests__/components/chat/message-block-layout.test.tsx` mount the conversation
with representative message and block fixtures. Cases at 412 and 1352 verify run boundaries,
the absence of user avatars, the avatar dimensions and the shared text and block edge. Active tool
cases cover empty threads and user or Astra predecessors, then complete the reply and compare
the trace and prose edges. Web
measures compiled styles in hermetic Chromium through Vitest; Android measures its rendered
native styles through Yoga. The wider block matrix also covers both locales, block-only replies,
previews, read lists, metrics, clarification, outcomes and actions.

## Lean answer placement

Validated final parts lead with the API's selected answer block. Negotiated operation previews
and terminal blocks precede external text. Completed tool steps use their existing collapsed
disclosure after the answer; running feedback remains in the pending slot. Zero to two small
follow-up pills retain an accessible group name without a visible heading. Populated threads hide
generic composer suggestions, while empty-thread starters and Ideas retain their own behavior.

Block-only completion receives one localized polite turn announcement. The announcement reads
visible parts rather than duplicate legacy prose. Legacy history retains its supported fallback;
malformed or missing sole answers recover visibly. Code copying remains governed by
`astra-block-copy-surfaces.md`. API composition owns short-text exceptions and grounded proactive results; data-backed entries require their corresponding typed blocks.

History stores block-only replies as structured answer context within the API's message length
limit. Read queries retain absolute scope and identity without refresh or paging credentials;
choice and pick-list context retains the question and options without adding unseen prose.
Repeated operation states coalesce only by their supplied pending-operation identity. Catalog
tool names are reusable; outcomes without an execution identity remain separate, including failures.

Proactive entry requests on web and Android advertise the shared chat context. The shared store
carries validated parts into the same message and block renderers, suppressing duplicate saved
prose. Old entries can adopt their first valid block while retaining identity and acted state;
existing typed snapshots keep their original read and refresh owner. Missing, malformed and
unknown sole parts retain visible legacy content. Paired Vitest cases render every proactive
trigger in both locales and verify one block without the legacy prose.

## Conversation motion

Both message renderers use `resolveConversationMotion` from the shared theme. New user messages
rise from the composer edge; pending replies and newly delivered answer parts use bounded
sequencing. Provisional stream deltas retain the final-answer boundary and never become visible
through animation. Motion changes presentation without postponing delivery, mutations or taps.

Read refreshes and preview revisions retain their operation identity and fade their changed
content. Block frames use library layout transitions for preview outcomes and Show more height
changes. Composer growth and shrinkage use the same library layout timing. The shell groups the
web composer layout identity across Hoje and the conversation; Android measures the source
composer and translates its destination from that position. Draft and focus owners stay intact.
Reduced motion removes travel, layout animation and sequencing, and settles active fades.

The web content resize observer and Android content-size and keyboard owners preserve following
the newest item through layout changes. Reading earlier content still suspends following.
Vitest covers the timing configuration, live preference changes, immediate controls, stream
replacement, block actions, composer sizing and the existing participant geometry on both platforms.
Native rasterization and device motion remain outside these hermetic checks.
