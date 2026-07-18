#!/usr/bin/env node
// Parity proof for Orbit's dual-target hook engine. Three layers:
//   1. _lib unit checks — the shared rule logic in isolation.
//   2. Claude Code hooks — run the real hook files with stdin payloads; asserts
//      the refactor preserved the exact block/allow behavior (regression guard).
//   3. opencode plugin — drive the real plugin's tool.execute.before/after; the
//      SAME rule, off the SAME _lib, must block/allow identically.
// Run: node .claude/hooks/test-hooks.mjs   (exits non-zero on any failure)

import { mkdirSync, writeFileSync, rmSync, cpSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { checkGitCommand, checkGitWorktreeRemove, checkNpmExpoPin } from "./_lib/rules-git.mjs"
import { checkShellAllowlist, PRIMER_SHELL_ALLOWLIST } from "./_lib/rules-shell-allowlist.mjs"
import { checkEmDashes, checkBrandColors } from "./_lib/rules-content.mjs"
import { checkAiClicheCopy, checkPlaceholderContent, checkTypedUppercase } from "./_lib/rules-copy.mjs"
import { checkSecretInArgv } from "./_lib/rules-secrets.mjs"
import {
  checkTsAntipatterns,
  checkMobileSupabaseLazy,
  checkEfMigrationRawIndex,
  checkNewTodos,
  checkCsharpAuthz,
  checkCsharpTimezone,
  checkCsharpFluentConfig,
} from "./_lib/rules-source.mjs"
import { classifyScope, parityMessages } from "./_lib/rules-parity.mjs"

const hooksDir = dirname(fileURLToPath(import.meta.url))
let fails = 0
const T = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}
const NV = "--no-" + "verify"
const MARK = "TO" + "DO"
const EM = String.fromCharCode(8212) // em dash

// ---------------------------------------------------------------------------
// 1. _lib unit
// ---------------------------------------------------------------------------
console.log("# _lib unit")
T("git: push main blocks", !!checkGitCommand("git push origin main")?.block, true)
T("git: push feature allows", checkGitCommand("git push origin feature/x"), null)
T("git: no-verify blocks", !!checkGitCommand("git commit -m x " + NV)?.block, true)
T("git: commit -n blocks", !!checkGitCommand("git commit -n -m x")?.block, true)
T("git: bare push on main blocks", !!checkGitCommand("git push", { resolveHeadBranch: () => "main", cwd: "." })?.block, true)
T("git: bare push on feature allows", checkGitCommand("git push", { resolveHeadBranch: () => "feature/x", cwd: "." }), null)

// Branch protection is scoped to the three Orbit repos: sibling repos driven
// from this session (the brain vault, thomas-brain) are direct-to-main by design.
const orbitRemote = () => "git@github.com:thomasluizon/orbit-api.git"
const brainRemote = () => "https://github.com/thomasluizon/brain.git"
T("git: push main in an Orbit repo blocks", !!checkGitCommand("git push origin main", { resolveRemoteUrl: orbitRemote, cwd: "." })?.block, true)
T("git: push main in a non-Orbit repo allows", checkGitCommand("git push origin main", { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: cd to a non-Orbit repo then push main allows", checkGitCommand('cd "C:\\x\\brain" && git push origin main', { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: -C into a non-Orbit repo allows", checkGitCommand("git -C /c/brain push origin main", { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: unresolvable remote still blocks (fails safe)", !!checkGitCommand("git push origin main", { resolveRemoteUrl: () => "", cwd: "." })?.block, true)
T("git: throwing remote resolver still blocks (fails safe)", !!checkGitCommand("git push origin main", { resolveRemoteUrl: () => { throw new Error("not a repo") }, cwd: "." })?.block, true)
T("git: bare push on main in a non-Orbit repo allows", checkGitCommand("git push", { resolveHeadBranch: () => "main", resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: no-verify blocks even in a non-Orbit repo", !!checkGitCommand("git commit -m x " + NV, { resolveRemoteUrl: brainRemote })?.block, true)

// Every push in a chain is judged on its own target. Bouncing between sibling
// repos in one command is routine, so a chain must not be decided by whichever
// push happens to come first.
const perDirRemote = (dir) => (/brain/.test(String(dir)) ? brainRemote() : orbitRemote())
T(
  "git: chained unprotected push then Orbit push main blocks",
  !!checkGitCommand("git -C /c/brain push origin main && git -C /c/orbit-api push origin main", { resolveRemoteUrl: perDirRemote, cwd: "." })?.block,
  true,
)
T(
  "git: chained Orbit feature push then unprotected push main allows",
  checkGitCommand("git -C /c/orbit-api push origin feature/x && git -C /c/brain push origin main", { resolveRemoteUrl: perDirRemote, cwd: "." }),
  null,
)
T(
  "git: chained unprotected push then bare Orbit push on main blocks",
  !!checkGitCommand("git -C /c/brain push origin main && git -C /c/orbit-api push", { resolveRemoteUrl: perDirRemote, resolveHeadBranch: () => "main", cwd: "." })?.block,
  true,
)

// A heredoc body is data, not flags: writing ABOUT a banned flag in a commit
// message is not using it. But a heredoc feeding a shell IS commands.
T("git: heredoc message mentioning the flag allows", checkGitCommand(`git commit -F - <<'EOF'\nfix: stop passing ${NV} in CI\nEOF`), null)
T("git: heredoc message mentioning push main allows", checkGitCommand("git commit -F - <<'EOF'\ndocs: explain why git push origin main is blocked\nEOF"), null)
T("git: flag outside the heredoc still blocks", !!checkGitCommand(`git commit ${NV} -F - <<'EOF'\nmessage body\nEOF`)?.block, true)
T("git: shell heredoc keeps its body in scope", !!checkGitCommand("bash <<'EOF'\ngit push origin main\nEOF")?.block, true)
// The shell exception must be anchored to each heredoc's own consumer: a body
// that merely mentions `bash <<` must not switch its own stripping back off.
T(
  "git: body mentioning a shell heredoc still gets stripped",
  checkGitCommand(`gh pr create --body "$(cat <<'PRBODY'\nthe bash <<EOF form keeps its body; the cron does git push on main\nPRBODY\n)"`),
  null,
)
// git worktree remove --force follows a Windows junction and deletes the target.
T("git-worktree: --force blocks", !!checkGitWorktreeRemove("git worktree remove --force .claude/worktrees/x")?.block, true)
T("git-worktree: -f short form blocks", !!checkGitWorktreeRemove("git worktree remove -f .claude/worktrees/x")?.block, true)
T("git-worktree: no force allows", checkGitWorktreeRemove("git worktree remove .claude/worktrees/x"), null)
T("git-worktree: unrelated git allows", checkGitWorktreeRemove("git worktree list"), null)
T("git-worktree: -f inside a path is not the flag", checkGitWorktreeRemove("git worktree remove .claude/worktrees/feat-foo"), null)
// A commit message that NAMES the flag is data, not a command (heredoc body stripped).
T(
  "git-worktree: heredoc message naming the flag allows",
  checkGitWorktreeRemove("git commit -F - <<'EOF'\nchore: block git worktree remove --force in the junction guard\nEOF"),
  null,
)
// The force flag must be in the SAME segment as `worktree remove` (segment-scoped
// like checkGitCommand) — a later `--force` on an unrelated command must not block.
T(
  "git-worktree: force on a later chained command allows",
  checkGitWorktreeRemove("git worktree remove .claude/worktrees/x && npm test -- --force"),
  null,
)
T(
  "git-worktree: force in the same segment still blocks",
  !!checkGitWorktreeRemove("git worktree remove --force .claude/worktrees/x && npm test")?.block,
  true,
)

T("npm: update blocks", !!checkNpmExpoPin("npm update")?.block, true)
T("npm: expo install pin blocks", !!checkNpmExpoPin("npm install expo-router@1.2.3")?.block, true)
T("npm: normal install allows", checkNpmExpoPin("npm install lodash"), null)

T("em: dash in locale blocks", !!checkEmDashes(`a ${EM} b`, "/x/packages/shared/src/i18n/en.json")?.block, true)
T("em: dash in code allows", checkEmDashes(`a ${EM} b`, "/x/apps/web/app/page.tsx"), null)
const fakeGlobals = () => ":root{ --primary: #7f46f7; --primary-rgb: 127, 70, 247; }"
T("brand: hex in web blocks", !!checkBrandColors("color:#7f46f7", "/x/apps/web/components/Foo.tsx", fakeGlobals)?.block, true)
T("brand: token allows", checkBrandColors("color:var(--primary)", "/x/apps/web/components/Foo.tsx", fakeGlobals), null)

// i18n copy register. `EN` is a locale path; `TSX` proves the rules are scoped
// to locale JSON and never to code.
const EN = "/x/packages/shared/src/i18n/en.json"
const PT = "/x/packages/shared/src/i18n/pt-BR.json"
const TSX = "/x/apps/web/components/Foo.tsx"
const pair = (key, value) => `"${key}": ${JSON.stringify(value)}`

T("cliche: banned word in a value blocks", !!checkAiClicheCopy(pair("hero.title", "Seamlessly elevate your workflow"), EN)?.block, true)
T("cliche: inflected form blocks", !!checkAiClicheCopy(pair("hero.sub", "Streamlining your day"), EN)?.block, true)
T("cliche: plain copy allows", checkAiClicheCopy(pair("common.loading", "Loading..."), EN), null)
// Values-only is the soundness argument: a KEY carrying a banned word is not copy.
T("cliche: banned word in the KEY allows", checkAiClicheCopy(pair("seamless.title", "Sync your habits"), EN), null)
T("cliche: code is out of scope", checkAiClicheCopy('const elevate = "Unleash"', TSX), null)
// `elevator` / `elevated` must not match `\belevate\b`-family false-positively.
T("cliche: 'elevator' is not the cliché", checkAiClicheCopy(pair("a11y.lift", "Take the elevator"), EN), null)

// The MODAL edit shape: `Edit` does not require quotes around `new_string`, so
// polishing an existing value yields bare unquoted prose with no `"` anywhere.
// Every other case here is quoted, which is exactly how these guards shipped
// silently no-opping on the one shape that matters most (#558 review, High).
// The corpus guard proves the false-POSITIVE rate; these pin the false-NEGATIVE.
const edited = "Seamlessly elevate your habits"
T("cliche: unquoted Edit value blocks", !!checkAiClicheCopy(edited, EN)?.block, true)
T("cliche: unquoted Edit value blocks (pt-BR)", !!checkAiClicheCopy("Otimize sua rotina de forma seamless", PT)?.block, true)
T("placeholder: unquoted Edit value blocks", !!checkPlaceholderContent("John Doe", EN)?.block, true)
T("uppercase: unquoted Edit value blocks", !!checkTypedUppercase("ASK ASTRA NOW", EN)?.block, true)
// A colon in prose must not send it down the structured-fragment bail-out.
T("cliche: unquoted value containing a colon blocks", !!checkAiClicheCopy("Sync: seamlessly elevate", EN)?.block, true)
// Values-only still holds on the unquoted path: a lone key token is not prose.
T("cliche: unquoted lone KEY token allows", checkAiClicheCopy("habits.seamless.title", EN), null)
T("cliche: unquoted clean copy allows", checkAiClicheCopy("Sync your habits", EN), null)
// A real pt-BR string from the shipped file — the corpus this must never fight.
T("cliche: real pt-BR copy allows", checkAiClicheCopy(pair("insights.loading", "Carregando análises..."), PT), null)

T("placeholder: John Doe blocks", !!checkPlaceholderContent(pair("profile.name", "John Doe"), EN)?.block, true)
T("placeholder: Lorem ipsum blocks", !!checkPlaceholderContent(pair("x.body", "Lorem ipsum dolor sit amet"), EN)?.block, true)
T("placeholder: real copy allows", checkPlaceholderContent(pair("profile.name", "Your name"), EN), null)
// orbit-api's unit tests legitimately seed "John Doe"/"ACME". The rule is scoped
// to locale JSON precisely so it cannot false-fire on correct test data.
T("placeholder: a C# test fixture is out of scope", checkPlaceholderContent('CreateTestUser("John Doe")', "/x/orbit-api/tests/Foo/BarTests.cs"), null)

// Verified against the real locale files: these four shapes are what actually
// ship, and only the eyebrow is a violation. See the PR for #539 bundle 4b.
T("uppercase: a shouted sentence blocks", !!checkTypedUppercase(pair("habits.detail.askAstraEyebrow", "ASK ASTRA"), EN)?.block, true)
T("uppercase: an accented pt-BR shout blocks", !!checkTypedUppercase(pair("habits.detail.askAstraEyebrow", "PERGUNTE À ASTRA"), PT)?.block, true)
T("uppercase: AM/PM allows (single-token acronym)", checkTypedUppercase(pair("common.amPm", "AM/PM"), EN), null)
T("uppercase: HH:MM allows (format token)", checkTypedUppercase(pair("habits.form.t", "HH:MM"), EN), null)
// The user must literally type ORBIT back to confirm — uppercase is load-bearing.
T("uppercase: the ORBIT confirm placeholder allows", checkTypedUppercase(pair("profile.freshStart.confirmPlaceholder", "ORBIT"), EN), null)
T("uppercase: PRO badge allows", checkTypedUppercase(pair("tour.ui.pro", "PRO"), EN), null)
T("uppercase: an interpolated XP label allows", checkTypedUppercase(pair("gamification.profileCard.xp", "{current} / {next} XP"), EN), null)
T("uppercase: sentence case allows", checkTypedUppercase(pair("profile.title", "AI Features"), EN), null)

// The corpus guard. A copy rule is only worth shipping if it does not fight the
// 2466 strings already in the product, so assert each rule against the REAL
// locale files rather than against fixtures chosen to make it pass. This is what
// caught the straight-punctuation rule (148 counter-examples) before it shipped.
const localeDir = join(hooksDir, "..", "..", "packages", "shared", "src", "i18n")
for (const locale of ["en.json", "pt-BR.json"]) {
  const localePath = join(localeDir, locale)
  if (!existsSync(localePath)) {
    console.log(`SKIP corpus guard for ${locale} (not present)`)
    continue
  }
  const corpus = readFileSync(localePath, "utf8")
  T(`corpus: ${locale} has zero AI-cliché findings`, checkAiClicheCopy(corpus, localePath), null)
  T(`corpus: ${locale} has zero placeholder findings`, checkPlaceholderContent(corpus, localePath), null)
  // Zero: the two Ask-Astra eyebrow strings were the last typed-uppercase debt and
  // b5's copy pass (#539) natural-cased them (the eyebrow uppercases in CSS, so the
  // string is stored natural). The shipped locale now carries ZERO typed-uppercase
  // violations, which is the desired invariant; the detector's block behavior is
  // pinned by the synthetic "shouted sentence blocks" tests above. This corpus guard
  // keeps any NEW typed-uppercase value from creeping into the real locale files.
  const uppercaseFindings = (checkTypedUppercase(corpus, localePath)?.message.match(/^ {2}- /gm) ?? []).length
  T(`corpus: ${locale} has zero typed-uppercase findings`, uppercaseFindings, 0)
}

// Secrets in argv. The block is on a LITERAL; a variable reference is the
// correct way to pass a credential and must stay allowed.
//
// The fixtures below are ASSEMBLED, the same idiom as NV / MARK / EM above: this
// file cannot spell out the very strings its guards detect. Here the detector is
// the required GitGuardian check, which matches the SHAPE of a credential-bearing
// command rather than the entropy of its value, so a spelled-out
// `Authorization: Bearer x` or an inline `<NAME>=x` fails every PR even though no
// value is real (sanitising values to EXAMPLE-NOT-A-REAL-* did not clear it).
// Assembling keeps each assertion exercising the byte-identical command string
// with no scannable match left in the source.
// See https://github.com/thomasluizon/orbit-ui-mobile/pull/558
const FAKE = "EXAMPLE-NOT-A-REAL-VALUE"
const TOKEN_FLAG = "--to" + "ken"
const KEY_FLAG = "--api" + "-key"
const AUTH = ["Authorization:", "Bear" + "er"].join(" ")
const bearer = (value) => `curl -H "${AUTH} ${value}" https://api.x`
const inlineEnv = (name, value, rest) => `${name}${"="}${value} ${rest}`
const flagLit = (flag, value) => `vercel deploy ${flag} ${value}`

T("secret: --token literal blocks", !!checkSecretInArgv(flagLit(TOKEN_FLAG, "abcd1234"))?.block, true)
T("secret: --token= literal blocks", !!checkSecretInArgv(`vercel deploy ${TOKEN_FLAG}${"="}${FAKE}`)?.block, true)
T("secret: --api-key literal blocks", !!checkSecretInArgv(`some-cli ${KEY_FLAG} ${FAKE}`)?.block, true)
T("secret: Authorization Bearer literal blocks", !!checkSecretInArgv(bearer(FAKE))?.block, true)
T("secret: inline GITHUB_TOKEN literal blocks", !!checkSecretInArgv(inlineEnv("GITHUB_TOKEN", FAKE, "gh pr list"))?.block, true)
T("secret: inline STRIPE_SECRET_KEY literal blocks", !!checkSecretInArgv(inlineEnv("STRIPE_SECRET_KEY", FAKE, "node seed.js"))?.block, true)
T("secret: --token $VAR allows", checkSecretInArgv(flagLit(TOKEN_FLAG, '"$VERCEL_TOKEN"')), null)
T("secret: --token ${VAR} allows", checkSecretInArgv(flagLit(TOKEN_FLAG, "${VERCEL_TOKEN}")), null)
T("secret: inline VERCEL_TOKEN=$VAR allows", checkSecretInArgv(inlineEnv("VERCEL_TOKEN", "$VERCEL_TOKEN", "vercel deploy")), null)
T("secret: Authorization Bearer $VAR allows", checkSecretInArgv(bearer("$TOKEN")), null)
// `gh auth login --with-token` is the SAFE stdin form; `--token` must not match
// inside `--with-token`, or the guard would block the very fix it recommends.
T("secret: gh --with-token stdin form allows", checkSecretInArgv(`gh auth login --with${TOKEN_FLAG} < token.txt`), null)
T("secret: an ordinary command allows", checkSecretInArgv("npm run build"), null)
// Text is not a command: a message ABOUT --token is documentation, not a leak.
T(
  "secret: heredoc body naming --token allows",
  checkSecretInArgv(`git commit -F - <<'EOF'\nchore: stop passing ${TOKEN_FLAG} abc123 in CI\nEOF`),
  null,
)

T("ts: console.log blocks", !!checkTsAntipatterns("/x/apps/web/a.ts", "console.log(1)")?.block, true)
T("ts: clean allows", checkTsAntipatterns("/x/apps/web/a.ts", "export const a = 1"), null)
T("ts: test file skipped", checkTsAntipatterns("/x/apps/web/a.test.ts", "console.log(1)"), null)

// Mobile Supabase must stay lazy — a module-scope throw/init crashes to a grey screen (#172/#174).
T("supabase: module-scope throw blocks", !!checkMobileSupabaseLazy("/x/apps/mobile/lib/supabase.ts", 'throw new Error("no env")')?.block, true)
T("supabase: top-level createClient blocks", !!checkMobileSupabaseLazy("/x/apps/mobile/lib/supabase.ts", "export const supabase = createClient(url, key)")?.block, true)
// The realistic forms the first cut missed (PR #556 review): an indented / guard-clause
// throw, and a TYPED top-level const — the style the real file already uses.
T("supabase: indented guard-clause throw blocks", !!checkMobileSupabaseLazy("/x/apps/mobile/lib/supabase.ts", "const url = process.env.URL\nif (!url) throw new Error('missing')")?.block, true)
T("supabase: typed top-level createClient blocks", !!checkMobileSupabaseLazy("/x/apps/mobile/lib/supabase.ts", "export const supabase: SupabaseClient = createClient(url, key)")?.block, true)
T(
  "supabase: lazy accessor allows (throw inside a function)",
  checkMobileSupabaseLazy("/x/apps/mobile/lib/supabase.ts", "export function getSupabaseClient() {\n  if (!client) throw new Error('x')\n  return createClient(url, key)\n}"),
  null,
)
// The lazy arrow form has `() =>` between `=` and createClient — must NOT false-block.
T(
  "supabase: lazy arrow accessor allows",
  checkMobileSupabaseLazy("/x/apps/mobile/lib/supabase.ts", "export const getSupabaseClient = () => createClient(url, key)"),
  null,
)
T("supabase: off-path skipped", checkMobileSupabaseLazy("/x/apps/web/lib/supabase.ts", 'throw new Error("no env")'), null)

// EF raw index SQL must be idempotent — a bare CREATE INDEX throws 42P07 at startup deploy.
T(
  "ef-index: raw CREATE UNIQUE INDEX blocks",
  !!checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("CREATE UNIQUE INDEX ix_foo ON foo (bar)");')?.block,
  true,
)
T(
  "ef-index: raw DROP INDEX without IF EXISTS blocks",
  !!checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("DROP INDEX ix_foo");')?.block,
  true,
)
T(
  "ef-index: IF NOT EXISTS form allows",
  checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)");'),
  null,
)
T(
  "ef-index: CreateIndex API call allows",
  checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.CreateIndex(name: "ix_foo", table: "foo", column: "bar");'),
  null,
)
T("ef-index: off-path skipped", checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Application/Foo.cs", 'migrationBuilder.Sql("CREATE INDEX ix_foo ON foo (bar)");'), null)
// Multi-statement Sql(): a sibling statement's IF NOT EXISTS must not mask another
// statement in the same call that lacks it (PR #556 review, per-statement check).
T(
  "ef-index: batched Sql with one non-idempotent statement blocks",
  !!checkEfMigrationRawIndex(
    "/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs",
    'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX ix_a ON foo (a);");',
  )?.block,
  true,
)
T(
  "ef-index: batched Sql with all idempotent statements allows",
  checkEfMigrationRawIndex(
    "/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs",
    'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX IF NOT EXISTS ix_a ON foo (a);");',
  ),
  null,
)
T("todos: marker blocks", !!checkNewTodos("/x/apps/web/a.ts", `// ${MARK}: fix`)?.block, true)
T("todos: tracked ref allows", checkNewTodos("/x/apps/web/a.ts", `// ${MARK} #123: later`), null)
T("csharp-authz: missing blocks", !!checkCsharpAuthz("/x/orbit-api/src/Orbit.Api/Controllers/FooController.cs", "public class FooController {}")?.block, true)
T("csharp-authz: present allows", checkCsharpAuthz("/x/orbit-api/src/Orbit.Api/Controllers/FooController.cs", "[Authorize]\npublic class FooController {}"), null)
T("csharp-tz: UtcNow blocks", !!checkCsharpTimezone("/x/orbit-api/src/Orbit.Application/Foo.cs", "var x = DateTime.UtcNow;")?.block, true)
T("csharp-tz: AtUtc allows", checkCsharpTimezone("/x/orbit-api/src/Orbit.Application/Foo.cs", "var CreatedAtUtc = DateTime.UtcNow;"), null)
T("csharp-fluent: unconfigured blocks", !!checkCsharpFluentConfig("/x/orbit-api/src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs", "DbSet<Habit> Habits {get;}")?.block, true)
T("parity: classify web", classifyScope("/x/apps/web/a.ts"), "web")
T("parity: nudge fires", parityMessages({ web: 3, mobile: 0 }).length > 0, true)

// primer's agent-scoped shell allowlist. The deny cases are the point: a prefix
// allowlist alone is not a fence, so the metacharacter rejection must run first.
const PRIMER = { allowlist: PRIMER_SHELL_ALLOWLIST, agent: "primer" }
T("shell: gh issue view allows", checkShellAllowlist("gh issue view 123 --json title,body", PRIMER), null)
T("shell: git log allows", checkShellAllowlist("git log --oneline -10", PRIMER), null)
T("shell: git branch --show-current allows", checkShellAllowlist("git branch --show-current", PRIMER), null)
T("shell: git -C <dir> log allows (the form /prime actually runs)", checkShellAllowlist('git -C "C:\\Users\\x\\orbit-api" log --oneline -10', PRIMER), null)
T("shell: git -C <dir with spaces> log allows", checkShellAllowlist('git -C "C:\\Program Files\\repo" log', PRIMER), null)
T("shell: echo denied", !!checkShellAllowlist("echo hi", PRIMER)?.block, true)
T("shell: chained bypass denied", !!checkShellAllowlist("git log && echo pwned", PRIMER)?.block, true)
T("shell: chained write to a source file denied", !!checkShellAllowlist("git log && echo pwned > x.ts", PRIMER)?.block, true)
T("shell: redirection denied", !!checkShellAllowlist("git log > /tmp/x", PRIMER)?.block, true)
T("shell: command substitution denied", !!checkShellAllowlist("git log $(whoami)", PRIMER)?.block, true)
T("shell: backtick substitution denied", !!checkShellAllowlist("git log `whoami`", PRIMER)?.block, true)
T("shell: pipe denied", !!checkShellAllowlist("git log | sh", PRIMER)?.block, true)
T("shell: semicolon denied", !!checkShellAllowlist("git log; rm -rf /", PRIMER)?.block, true)
T("shell: newline denied", !!checkShellAllowlist("git log\necho pwned", PRIMER)?.block, true)
T("shell: shell-escaped chaining denied", !!checkShellAllowlist("git log \\&\\& echo pwned", PRIMER)?.block, true)
// `git -c` executes arbitrary code through config, so it must not survive the
// -C stripping that the /prime form depends on.
T("shell: git -c config escape denied", !!checkShellAllowlist("git -c core.pager=sh log", PRIMER)?.block, true)
T("shell: git --exec-path escape denied", !!checkShellAllowlist("git --exec-path=/tmp log", PRIMER)?.block, true)
// Rejecting `>` does NOT make "never writes" structural on its own: a
// subcommand's own flags write files with no shell metacharacter at all. These
// two are the real thing — `git log --format=format:x --output=<path>` was a
// verified arbitrary-file-write through the first version of this allowlist
// (PR #546 review), which is why arguments are allowlisted and not just the
// command prefix.
T("shell: git log --output= (arbitrary file write, no metacharacter) denied", !!checkShellAllowlist("git log --output=/tmp/x", PRIMER)?.block, true)
T("shell: git log --format=format:x --output= (attacker-chosen content) denied", !!checkShellAllowlist("git log -1 --format=format:pwned --output=/tmp/x", PRIMER)?.block, true)
T("shell: git log --ext-diff denied (unlisted flag)", !!checkShellAllowlist("git log --ext-diff", PRIMER)?.block, true)
T("shell: gh issue view --template denied (unlisted flag)", !!checkShellAllowlist("gh issue view 1 --template x", PRIMER)?.block, true)
// The exact entry takes no arguments: git rejects -D alongside --show-current
// today, but that is git's conflict handling, not this fence's.
T("shell: git branch --show-current with trailing tokens denied", !!checkShellAllowlist("git branch --show-current -D main", PRIMER)?.block, true)
// Same binary, same subcommand prefix depth, mutating verb: prove the match is
// per-token and not a loose "starts with git/gh" check.
T("shell: git branch -D denied", !!checkShellAllowlist("git branch -D main", PRIMER)?.block, true)
T("shell: git push denied", !!checkShellAllowlist("git push origin main", PRIMER)?.block, true)
T("shell: gh pr create denied", !!checkShellAllowlist("gh pr create --title x", PRIMER)?.block, true)
T("shell: gh issue edit denied", !!checkShellAllowlist("gh issue edit 1 --body x", PRIMER)?.block, true)

// ---------------------------------------------------------------------------
// 2. Claude Code hooks — run the real files, assert exit codes
// ---------------------------------------------------------------------------
console.log("\n# claude code hooks (real files)")
const root = join(tmpdir(), "orbit-hook-parity")
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
const write = (rel, body) => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
  return p
}
function runHook(file, payload) {
  const res = spawnSync(process.execPath, [join(hooksDir, file)], { input: JSON.stringify(payload), encoding: "utf8" })
  return res.status
}

T("cc git-guardrails: push main -> 2", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git push origin main" } }), 2)
T("cc git-guardrails: feature -> 0", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git push origin feature/x" } }), 0)
T("cc git-guardrails: worktree remove --force -> 2", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git worktree remove --force .claude/worktrees/x" } }), 2)
T("cc git-guardrails: worktree remove (no force) -> 0", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git worktree remove .claude/worktrees/x" } }), 0)
T("cc expo-pin: update -> 2", runHook("forbid-expo-pin-bump.mjs", { tool_name: "Bash", tool_input: { command: "npm update" } }), 2)
T("cc em-dashes: locale dash -> 2", runHook("forbid-em-dashes.mjs", { tool_name: "Write", tool_input: { file_path: join(root, "packages/shared/src/i18n/en.json"), content: `{"k":"a ${EM} b"}` } }), 2)
const localeFile = join(root, "packages/shared/src/i18n/en.json")
const copyHook = (file, content) => runHook(file, { tool_name: "Write", tool_input: { file_path: localeFile, content } })
T("cc ai-cliche: banned word -> 2", copyHook("forbid-ai-cliche-copy.mjs", '{"a": "Seamlessly elevate your day"}'), 2)
T("cc ai-cliche: plain copy -> 0", copyHook("forbid-ai-cliche-copy.mjs", '{"a": "Loading..."}'), 0)
T("cc placeholder: John Doe -> 2", copyHook("forbid-placeholder-content.mjs", '{"a": "John Doe"}'), 2)
T("cc placeholder: real copy -> 0", copyHook("forbid-placeholder-content.mjs", '{"a": "Your name"}'), 0)
T("cc typed-uppercase: shouted string -> 2", copyHook("forbid-typed-uppercase.mjs", '{"a": "ASK ASTRA"}'), 2)
T("cc typed-uppercase: acronym -> 0", copyHook("forbid-typed-uppercase.mjs", '{"a": "AM/PM"}'), 0)

const secretHook = (command) => runHook("forbid-secret-in-argv.mjs", { tool_name: "Bash", tool_input: { command } })
T("cc secret-in-argv: literal --token -> 2", secretHook(flagLit(TOKEN_FLAG, "abcd1234")), 2)
T("cc secret-in-argv: $VAR reference -> 0", secretHook(flagLit(TOKEN_FLAG, '"$VERCEL_TOKEN"')), 0)
T("cc secret-in-argv: ordinary command -> 0", secretHook("npm run build"), 0)
// A secret fence must not fail open when it cannot read its own payload.
T("cc secret-in-argv: unreadable payload fails CLOSED -> 2", runHook("forbid-secret-in-argv.mjs", { tool_name: "Bash", tool_input: {} }), 2)

const tsBad = write("apps/web/bad.ts", "console.log(1)\n")
const tsGood = write("apps/web/good.ts", "export const a = 1\n")
T("cc ts-antipatterns: console -> 2", runHook("forbid-ts-antipatterns.mjs", { tool_name: "Write", tool_input: { file_path: tsBad } }), 2)
T("cc ts-antipatterns: clean -> 0", runHook("forbid-ts-antipatterns.mjs", { tool_name: "Write", tool_input: { file_path: tsGood } }), 0)
const todoBad = write("apps/web/todo.ts", `// ${MARK}: later\n`)
T("cc flag-new-todos: marker -> 2", runHook("flag-new-todos.mjs", { tool_name: "Write", tool_input: { file_path: todoBad } }), 2)
const ctrlBad = write("orbit-api/src/Orbit.Api/Controllers/FooController.cs", "public class FooController {}\n")
T("cc csharp-authz: missing -> 2", runHook("csharp-authz.mjs", { tool_name: "Write", tool_input: { file_path: ctrlBad } }), 2)
const tzBad = write("orbit-api/src/Orbit.Application/Foo.cs", "var x = DateTime.UtcNow;\n")
T("cc csharp-tz: UtcNow -> 2", runHook("csharp-tz.mjs", { tool_name: "Write", tool_input: { file_path: tzBad } }), 2)
const supabaseBad = write("apps/mobile/lib/supabase.ts", 'throw new Error("no env")\n')
const supabaseGood = write("apps/mobile/lib/supabase.good.ts", "export function getSupabaseClient() {\n  return createClient(url, key)\n}\n")
T("cc supabase-eager: module throw -> 2", runHook("forbid-mobile-supabase-eager.mjs", { tool_name: "Write", tool_input: { file_path: supabaseBad } }), 2)
T("cc supabase-eager: lazy accessor -> 0", runHook("forbid-mobile-supabase-eager.mjs", { tool_name: "Write", tool_input: { file_path: supabaseGood } }), 0)
const efBad = write("orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("CREATE UNIQUE INDEX ix_foo ON foo (bar)");\n')
const efGood = write("orbit-api/src/Orbit.Infrastructure/Migrations/20260102_Add.cs", 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)");\n')
T("cc ef-index: raw CREATE INDEX -> 2", runHook("forbid-ef-migration-raw-index.mjs", { tool_name: "Write", tool_input: { file_path: efBad } }), 2)
T("cc ef-index: IF NOT EXISTS -> 0", runHook("forbid-ef-migration-raw-index.mjs", { tool_name: "Write", tool_input: { file_path: efGood } }), 0)

// primer's allowlist is wired in .claude/agents/primer.md's own frontmatter, not
// settings.json, so this asserts the file the agent points at really behaves.
const primerShell = (command) => runHook("primer-shell-allowlist.mjs", { tool_name: "Bash", tool_input: { command } })
T("cc primer-allowlist: gh issue view -> 0", primerShell("gh issue view 1"), 0)
T("cc primer-allowlist: git log -> 0", primerShell("git log --oneline -10"), 0)
// The two absolute `-C` forms /prime's step 4 actually runs. A false positive
// here breaks priming outright, so pin them against the real hook, not just _lib.
T("cc primer-allowlist: -C log (the form /prime runs) -> 0", primerShell('git -C "C:\\Users\\x\\orbit-api" log --oneline -10'), 0)
T("cc primer-allowlist: -C branch --show-current -> 0", primerShell('git -C "C:\\Users\\x\\orbit-api" branch --show-current'), 0)
T("cc primer-allowlist: echo -> 2", primerShell("echo hi"), 2)
T("cc primer-allowlist: chained bypass -> 2", primerShell("git log && echo pwned"), 2)
T("cc primer-allowlist: redirection -> 2", primerShell("git log > /tmp/x"), 2)
T("cc primer-allowlist: substitution -> 2", primerShell("git log $(whoami)"), 2)
// Unlike every other adapter here (which exits 0 on error so a broken hook never
// wedges Bash), this one is a security fence: an unvalidated command must not run.
T("cc primer-allowlist: unreadable payload fails CLOSED -> 2", runHook("primer-shell-allowlist.mjs", { tool_name: "Bash", tool_input: {} }), 2)
// The file-write primitive that has no shell metacharacter, through the real hook.
T("cc primer-allowlist: git log --output= -> 2", primerShell("git log -1 --format=format:pwned --output=/tmp/orbit-poc.txt"), 2)

// ---------------------------------------------------------------------------
// 3. opencode plugin — same rules, opencode contract
// ---------------------------------------------------------------------------
console.log("\n# opencode plugin (real plugin, .mjs copy for the Node loader)")
const repoRoot = join(hooksDir, "..", "..")
const pluginSrc = join(repoRoot, ".opencode", "plugin", "orbit-guardrails.js")
const pluginMjs = join(root, "orbit-guardrails.probe.mjs")
cpSync(pluginSrc, pluginMjs)
const plugin = (await import(pathToFileURL(pluginMjs).href)).default
// The plugin resolves _lib from the project directory (the real repo root); the
// fixture files it reads are absolute temp paths, so the directory only anchors _lib.
const hooks = await plugin({ directory: repoRoot })
const before = async (tool, args) => {
  try {
    await hooks["tool.execute.before"]({ tool }, { args })
    return false
  } catch {
    return true
  }
}
const after = async (tool, args) => {
  try {
    await hooks["tool.execute.after"]({ tool }, { args })
    return false
  } catch {
    return true
  }
}
T("oc before: push main throws", await before("bash", { command: "git push origin main" }), true)
T("oc before: feature allows", await before("bash", { command: "git push origin feature/x" }), false)
T("oc before: npm update throws", await before("bash", { command: "npm update" }), true)
T("oc before: worktree remove --force throws", await before("bash", { command: "git worktree remove --force .claude/worktrees/x" }), true)
T("oc before: worktree remove (no force) allows", await before("bash", { command: "git worktree remove .claude/worktrees/x" }), false)
T("oc before: em dash throws", await before("write", { filePath: localeFile, content: `a ${EM} b` }), true)
T("oc before: ai-cliché throws", await before("write", { filePath: localeFile, content: '{"a": "Seamlessly elevate your day"}' }), true)
T("oc before: placeholder throws", await before("write", { filePath: localeFile, content: '{"a": "John Doe"}' }), true)
T("oc before: typed uppercase throws", await before("write", { filePath: localeFile, content: '{"a": "ASK ASTRA"}' }), true)
T("oc before: acronym allows", await before("write", { filePath: localeFile, content: '{"a": "AM/PM"}' }), false)
T("oc before: literal --token throws", await before("bash", { command: flagLit(TOKEN_FLAG, "abcd1234") }), true)
T("oc before: --token $VAR allows", await before("bash", { command: flagLit(TOKEN_FLAG, '"$VERCEL_TOKEN"') }), false)
T("oc after: console.log throws", await after("edit", { filePath: tsBad, newString: "x" }), true)
T("oc after: clean allows", await after("edit", { filePath: tsGood, newString: "x" }), false)
T("oc after: csharp authz throws", await after("write", { filePath: ctrlBad, content: "x" }), true)
T("oc after: supabase eager throws", await after("write", { filePath: supabaseBad, content: "x" }), true)
T("oc after: supabase lazy allows", await after("write", { filePath: supabaseGood, content: "x" }), false)
T("oc after: ef raw index throws", await after("write", { filePath: efBad, content: "x" }), true)
T("oc exposes session.idle guard", typeof hooks["event"], "function")

// ---------------------------------------------------------------------------
// 4. Agent frontmatter — the fails-open `Bash(...)` trap
// ---------------------------------------------------------------------------
// `tools: Bash(gh:*)` does not restrict anything: the specifier is silently
// stripped, the entry resolves to bare `Bash`, and the agent gets a full unscoped
// shell behind frontmatter that reads like a restriction. It does not error, and
// the "fails to launch if nothing resolves" net never fires, because it DOES
// resolve. Prose cannot catch that; this can. See CLAUDE.md, "Agent tool scoping".
console.log("\n# agent frontmatter (fails-open Bash(...) guard)")

// The sibling repo is resolved off the MAIN checkout: this suite also runs from
// .claude/worktrees/<name>, where `../orbit-api` points into the worktree tree
// and would silently scan nothing.
function mainCheckoutRoot() {
  const res = spawnSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })
  return res.status === 0 && res.stdout.trim() ? dirname(res.stdout.trim()) : repoRoot
}

function frontmatterToolEntries(body) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)
  if (!frontmatter) return []
  return frontmatter[1]
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(?:tools|disallowedTools):\s*(.+)$/.exec(line)
      return match ? match[1].split(",").map((entry) => entry.trim()) : []
    })
    .filter(Boolean)
}

// `Agent(type)` is the one parenthesized form the frontmatter genuinely supports.
// Every other `Tool(...)` is the trap.
const failsOpen = (entry) => /^[A-Za-z_]\w*\s*\(/.test(entry) && !/^Agent\s*\(/.test(entry)

const agentDirs = [join(repoRoot, ".claude", "agents"), join(mainCheckoutRoot(), "..", "orbit-api", ".claude", "agents")]
let agentsScanned = 0
for (const dir of agentDirs) {
  if (!existsSync(dir)) {
    console.log(`SKIP ${dir} (not present)`)
    continue
  }
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".md"))) {
    agentsScanned++
    const offenders = frontmatterToolEntries(readFileSync(join(dir, file), "utf8")).filter(failsOpen)
    T(`agents: ${file} declares no parenthesized tool specifier`, offenders, [])
  }
}
// A guard that scanned nothing passes vacuously; make that a failure instead.
T("agents: the guard actually scanned agent files", agentsScanned > 0, true)

rmSync(root, { recursive: true, force: true })
console.log(`\n${fails === 0 ? "ORBIT HOOK PARITY OK" : `ORBIT HOOK PARITY FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
