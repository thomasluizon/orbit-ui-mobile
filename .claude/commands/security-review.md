---
description: Security review of code changes (either repo)
argument-hint: [file-or-directory|pr-number]
---

# Security Review

Perform a security-focused code review on the specified scope.

**Input**: $ARGUMENTS (defaults to staged changes in the current repo)

---

## Phase 1: SCOPE

1. If a file path is given, review that file
2. If a directory is given, review all source files in it
3. If a PR number, fetch the diff (`gh pr diff {N} --repo {owner/repo}`)
4. If no input, review staged changes (`git diff --cached --name-only`)
5. If nothing staged, review unstaged changes (`git diff --name-only`)

Identify whether the scope is frontend (`apps/`, `packages/`), backend (`orbit-api/src/`), or both. Tune the categories below accordingly.

---

## Phase 2: ANALYZE

Review against these categories. Focus on what's actually relevant to the change.

### 1. Injection

- **SQL Injection**: Raw SQL or string-interpolated EF queries
- **XSS**: Unescaped user input in JSX, `dangerouslySetInnerHTML`
- **Command Injection**: `exec()` / `Process.Start()` with user input
- **Path Traversal**: User input in file paths without sanitization

### 2. Authentication & Authorization

- Missing `[Authorize]` on new API endpoints
- Missing auth checks on Server Actions / BFF routes
- Hardcoded credentials, JWT secrets, API keys
- Insecure session management (`AGENTS.md` says httpOnly + sameSite strict + secure always)
- CORS configuration changes — should stay restrictive (explicit methods and headers, no `AllowAnyHeader()` / `AllowAnyMethod()`)
- Stripe API key — must be set globally in `Program.cs`, never per-request

### 3. Data Exposure

- Sensitive data in `console.log`, `ILogger` (passwords, tokens, PII)
- API responses leaking stack traces or DB schemas
- Secrets in source code / config files
- Missing input validation at API boundary
- Webhook handlers — must verify signatures (Stripe `WebhookSecret`)

### 4. Dependency & Configuration

- Known vulnerable dependency versions
- Debug mode enabled in production configs
- Missing security headers (`SecurityHeadersMiddleware` adds nosniff, DENY, referrer-policy, XSS headers — don't disable)
- Request size limits — Kestrel 10MB global, chat endpoint 20MB

### 5. Cryptography

- Weak hashing (MD5, SHA1 for passwords — BCrypt is the project standard)
- Hardcoded encryption keys
- Insecure RNG for security-sensitive values
- Missing HTTPS enforcement

### 6. Error Handling

- Verbose error messages exposing internals
- Unhandled promise rejections / unobserved tasks
- Catch blocks that swallow errors silently
- Result<T> not propagated correctly (`PropagateError<T>()` / `ToPayGateAwareResult()` per `orbit-api/AGENTS.md`)

### 7. Validation (Orbit-specific)

- **Backend is source of truth.** Frontend Zod validation is convenience only. Every new endpoint needs FluentValidation.
- Domain entity factory methods must enforce invariants (e.g., `Habit.Create` rejects invalid states).
- Numeric bounds, date ranges, mutually exclusive options — all enforced server-side.

---

## Phase 3: REPORT

For each finding:

```markdown
### [SEVERITY] Finding Title

**Category**: Injection | Auth | Data Exposure | Dependency | Crypto | Error Handling | Validation
**Severity**: Critical | High | Medium | Low | Info
**File**: `path/to/file:LINE`

**Issue**: {1-2 sentences}

**Risk**: {1-2 sentences on what could go wrong}

**Fix**:
```language
{suggested fix}
```

**Reference**: {OWASP / Orbit AGENTS.md / .NET docs}
```

### Severity Definitions

| Severity | Meaning | Action |
|----------|---------|--------|
| Critical | Exploitable, data breach risk | Block merge, fix immediately |
| High | Significant weakness | Fix before merge |
| Medium | Defense-in-depth issue | Fix soon, OK to merge with tracking |
| Low | Best practice deviation | Address when convenient |
| Info | Observation | Consider for future |

---

## Phase 4: SUMMARY

```markdown
## Security Review Complete

**Scope**: {files reviewed}
**Findings**: {total}

| Severity | Count |
|----------|-------|
| Critical | {n} |
| High | {n} |
| Medium | {n} |
| Low | {n} |
| Info | {n} |

### Verdict

PASS / PASS WITH NOTES / FAIL

### Action Items

1. {most important fix}
2. {next}
3. ...

### What Looks Good

- {positive security patterns observed}
```

---

## Tips

- Focus on changed code, not pre-existing issues (unless Critical)
- Be specific: file paths and line numbers
- Suggest fixes, don't just flag problems
- Consider context: internal-only vs public-facing changes the risk
- Flag patterns that could become problems at scale even if safe today
