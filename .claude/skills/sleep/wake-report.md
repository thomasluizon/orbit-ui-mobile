# Sleep: the wake report

Cold text of `.claude/skills/sleep/SKILL.md`. Read it when the owner says stop.

## 11. The wake report

He will say stop. Re-read the log file first, then answer in two parts and nothing else.
Read the open chain through `openSessionChain` in `tools/lib/session-chain.mjs`. Include every
entry's complete decisions and shipped rows, plus this session's log and ledger. An owner
`/wrap-up` runs its progress and question passes across that same chain before handoff closes it.

**Part one, every decision.** A numbered table: the decision, what you chose, and the one line of
evidence under it. Include the ones you got wrong and corrected, and say so plainly.

**Part two, what shipped.** Group it:

- Merged, with pull request numbers and what each one changed.
- Open, with the exact state and what it waits on.
- Tickets filed, with why each one is not in a pull request.
- Blocked, needing him, lifted from the log.

Then one honest paragraph: what is better than when he went to sleep, and what you would not defend.
