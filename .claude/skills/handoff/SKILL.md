---
name: handoff
description: Print one short prompt for the next owner session: the driver status, every open needs:owner item, each owner order not yet a ticket, and the decisions of this session. Use at the end of a session, when context runs out, or on /handoff. It ends the session after the prompt.
effort: medium
---

# /handoff

This skill prints one short prompt for the next owner session. It writes nothing in the repository.

## The prompt holds

1. The driver status. Take it from `/driver`.
2. Every open `needs:owner` item, each with the question that it needs answered.
3. Each owner order of this session that is not yet a ticket. Quote the owner's words. Name the ticket that the order needs.
4. The decisions that this session took.

## Steps

1. Run `/driver`.
2. List the open `needs:owner` items: `gh issue list --repo thomasluizon/orbit-tickets --label needs:owner --state open --json number,title`. Copy each number from this output.
3. Go through the session and find each owner order that has no ticket.
4. Send each durable decision to the brain with `/brain`.
5. Print the prompt.
6. End the session. Do not do the work that the prompt describes.
