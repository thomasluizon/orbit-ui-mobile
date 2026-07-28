---
name: quota
description: Read the current Claude and Codex quota windows as one machine-readable object. Use when the user asks for quota, allowance, usage percentage, reset timing, or whether either AI engine is available.
argument-hint: (none)
effort: low
---

# Quota

Run the repository quota reader from the orbit-ui-mobile root:

```bash
node tools/ai-quota.mjs --json
```

Return its JSON object unchanged. A single unavailable engine is a valid partial read. If both
engines are unavailable, show the object the tool printed and state that the read failed with
the tool's non-zero exit code.
