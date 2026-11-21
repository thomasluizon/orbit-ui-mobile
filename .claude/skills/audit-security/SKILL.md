---
name: audit-security
description: Security audit of the ui and api repositories. One Explore subagent per attack surface finds risks. Each verified finding becomes a ticket after one approval gate. Use for a security audit, a threat review or a hardening pass.
argument-hint: <path | repo | blank=both repos>
---

# Audit Security

**Input**: $ARGUMENTS

Audit both repositories and file one ticket for each verified risk. Each ticket names a `file:line`, the threat and the fix. The owner session runs this skill alone. It needs no workflow file and no custom agent.

## Scope

1. Read `.claude/skills/audit-security/checklist.md`. It holds sections A to J and the Deferred list.
2. Set the scope. Blank means both repositories. `api` or `backend` means the api repository. `frontend`, `web` or `mobile` means the ui repository. A path means that path.
3. Read both repository roots with `node --input-type=module -e 'import { readDriveConfig } from "./tools/lib/config.mjs"; console.log(JSON.stringify(readDriveConfig().repos))'`.

## Tier rules

- **Tier 1, must fix:** cross-user data access, auth bypass, secret leak, injection, an AI or MCP tool that changes the data of another user, a forged payment or webhook. Exploitable now.
- **Tier 2, should fix:** a missing rate limit on an abusable route, verbose errors, a defense-in-depth gap, missing input validation at a boundary, loose CORS that is not yet exploitable.
- **Tier 3:** WAF, SIEM, pen-test cadence, vault rotation, DDoS scrubbing, SOC2. Never file a ticket for Tier 3. Name these once as out of scope.
- When the real reach of a finding is unclear, pick the lower tier and add a "verify" note.

## What a gate already enforces (never a finding)

A gate owns the mechanical layer. This audit owns judgement. Do not report any of these:

- An ESLint `local/*` rule, a `guards.yml` step (Dash Ban, Copy Register, Expo SDK Pin, React Doctor) and the `PR Metadata` parity check.
- A Roslyn `ORBIT0001` to `ORBIT0005` rule. `ORBIT0003` proves that a controller has `[Authorize]` or `[AllowAnonymous]`.
- The shape of a committed secret. GitGuardian owns it.

When a gate proves presence and judgement proves correctness, audit the judgement half only. Two examples: check that a handler scopes its query to the `userId` of the caller. Check that a key is set globally and does not travel per request into a log.

## Run

1. Run the attack surfaces one after another. Run one subagent at a time. The surfaces are: authz and data isolation, AI and MCP tool scoping, injection, secrets and config, rate limits and AI abuse, error leakage with web and mobile auth, and privacy and data rights.
2. Start each surface with the Agent tool: `subagent_type: "Explore"` and `model: "haiku"`. The built-in `Explore` agent inherits the model of this session, so the `model` field is required. Without it the audit runs on Opus.
3. Write each prompt so that it stands alone. The built-in agent does not load `CLAUDE.md`. Put these in the prompt:
   - The surface and its checklist sections, copied from `checklist.md`.
   - The two repository roots.
   - The Tier rules and the exclusion list from this file.
   - The return format: `severity`, `title`, `location` as `file:line`, `evidence`, `threat`, `fix`.
4. Verify each Tier 1 and Tier 2 finding yourself. Open the code at the `file:line`. Drop a finding that the code does not support. Drop a finding that a gate already enforces.
5. Check the Deferred list of `checklist.md`. Mark each item that the repo cannot prove as "verify live". Without Render access, the database allow-list stays UNVERIFIED.
6. If a surface returns nothing or fails, say so. Never report a surface that did not run as clean.

## Approval gate

Show the owner one message with these parts:

- A table of the findings: tier, title, repository, `file:line` and the proposed ticket labels.
- The surfaces that ran, the Deferred list and the Tier 3 items that you left out.

Then ask for approval. Create nothing before the owner approves. After an edit request, change the draft and show the gate again.

## Tickets

For each approved finding, follow the ticket rules of `/ticket`: the body sections, the labels and the dash ban.

- **Problem and why:** the tier and the threat. Say who reaches it and what they get.
- **Technical details:** the `evidence` and the `fix`.
- **Out of scope:** the Tier 3 controls and the part that a gate owns.
- **Labels:** one `repo:*` from the location, one type label and one parity label for a ui ticket. An api fix that a ui ticket needs blocks that ticket.
- One fix and one pull request make one ticket. Fold findings that share a fix.

Create each ticket with `node tools/create-ticket.mjs --title "<title>" --body-file <file> --label "<label>"`. Create a blocker before the ticket it blocks. Copy each number from the tool output. Never write one from memory.

With no verified finding, create nothing. Report that the audit is clean and that the gates own the mechanical layer.

## Output

```markdown
## Audit Complete: Security

**Scope**: {what was audited}
**Posture**: {one line}

| Tier | Findings | Tickets |
|---|---|---|
| Tier 1 | {N} | {created or pending} |
| Tier 2 | {N} | {created or pending} |

**Tickets**: {issue number, title, repo, blockedBy; or "clean"}
**Deferred**: {the items to verify live}
```
