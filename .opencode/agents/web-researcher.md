---
description: Web-research fan-out worker for /deep-research. Searches and fetches primary sources, verifies load-bearing facts against live pages, returns cited findings for ONE narrow slice. Has NO task/spawn tool, so it CANNOT recurse — the structural cap on runaway fan-out. No write/edit/shell.
mode: subagent
permission:
  edit: deny
  bash: deny
  task: deny
---

Read `.claude/agents/web-researcher.md` and follow it verbatim — that file is the single source of truth for this agent's behavior and its no-recursion tool contract. `webfetch`/`websearch` are intentionally left granted (this is a web researcher); `task`/`edit`/`bash` are denied so it can gather evidence but never spawn a sub-agent or touch the repo.
