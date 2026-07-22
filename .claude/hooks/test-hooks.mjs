#!/usr/bin/env node
// Parity proof for Orbit's dual-target hook engine. Three layers:
//   1. _lib unit checks — the shared rule logic in isolation.
//   2. Claude Code hooks — run the real hook files with stdin payloads; asserts
//      the refactor preserved the exact block/allow behavior (regression guard).
//   3. opencode plugin — drive the real plugin's tool.execute.before/after; the
//      SAME rule, off the SAME _lib, must block/allow identically.
// Run: node .claude/hooks/test-hooks.mjs   (exits non-zero on any failure)

import { mkdirSync, mkdtempSync, writeFileSync, rmSync, cpSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
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
  checkCsharpAuthz,
  checkCsharpTimezone,
  checkCsharpFluentConfig,
} from "./_lib/rules-source.mjs"
import { classifyScope, parityMessages } from "./_lib/rules-parity.mjs"
import { checkGateTamperBash, checkGateTamperEdit } from "./_lib/rules-gate-tamper.mjs"

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
T("csharp-authz: missing blocks", !!checkCsharpAuthz("/x/orbit-api/src/Orbit.Api/Controllers/FooController.cs", "public class FooController {}")?.block, true)
T("csharp-authz: present allows", checkCsharpAuthz("/x/orbit-api/src/Orbit.Api/Controllers/FooController.cs", "[Authorize]\npublic class FooController {}"), null)
T("csharp-tz: UtcNow blocks", !!checkCsharpTimezone("/x/orbit-api/src/Orbit.Application/Foo.cs", "var x = DateTime.UtcNow;")?.block, true)
T("csharp-tz: AtUtc allows", checkCsharpTimezone("/x/orbit-api/src/Orbit.Application/Foo.cs", "var CreatedAtUtc = DateTime.UtcNow;"), null)
T("csharp-fluent: unconfigured blocks", !!checkCsharpFluentConfig("/x/orbit-api/src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs", "DbSet<Habit> Habits {get;}")?.block, true)
T("parity: classify web", classifyScope("/x/apps/web/a.ts"), "web")
T("parity: nudge fires", parityMessages({ web: 3, mobile: 0 }).length > 0, true)

// Visual-gate tamper guard. The gate's state files decide "done" for a visual
// pass; an agent that can rewrite them can fake completion without doing the
// work, which is the exact #539 failure. PAUSED is human-only; the manifest and
// verdicts are writable only through their sanctioned tools.
T("gate-tamper: touch PAUSED blocks", !!checkGateTamperBash("touch .claude/manifests/PAUSED")?.block, true)
T("gate-tamper: redirect into PAUSED blocks", !!checkGateTamperBash("echo x > .claude/manifests/PAUSED")?.block, true)
T("gate-tamper: cat manifest allows", checkGateTamperBash("cat .claude/manifests/surfaces.json"), null)
T("gate-tamper: jq manifest allows", checkGateTamperBash("jq .cellCount .claude/manifests/surfaces.json"), null)
T("gate-tamper: rm manifest blocks", !!checkGateTamperBash("rm .claude/manifests/surfaces.json")?.block, true)
T("gate-tamper: redirect over manifest blocks", !!checkGateTamperBash('echo "{}" > .claude/manifests/surfaces.json')?.block, true)
T("gate-tamper: git checkout manifest blocks", !!checkGateTamperBash("git checkout HEAD~5 -- .claude/manifests/surfaces.json")?.block, true)
T("gate-tamper: sanctioned manifest regen allows", checkGateTamperBash("node tools/surface-manifest.mjs"), null)
T("gate-tamper: npm surfaces:manifest allows", checkGateTamperBash("npm run surfaces:manifest"), null)
T("gate-tamper: cat verdicts allows", checkGateTamperBash("cat .artifacts/surfaces/verdicts.json"), null)
T("gate-tamper: node -e write to verdicts blocks", !!checkGateTamperBash(`node -e "require('fs').writeFileSync('.artifacts/surfaces/verdicts.json','{}')"`)?.block, true)
T("gate-tamper: redirect over verdicts blocks", !!checkGateTamperBash('echo "{}" > .artifacts/surfaces/verdicts.json')?.block, true)
T("gate-tamper: rm verdicts blocks", !!checkGateTamperBash("rm .artifacts/surfaces/verdicts.json")?.block, true)
T("gate-tamper: ordinary command allows", checkGateTamperBash("npm run build"), null)
T("gate-tamper: edit PAUSED blocks", !!checkGateTamperEdit("C:\\x\\.claude\\manifests\\PAUSED")?.block, true)
T("gate-tamper: edit manifest blocks", !!checkGateTamperEdit("/x/.claude/manifests/surfaces.json")?.block, true)
T("gate-tamper: edit verdicts blocks", !!checkGateTamperEdit("/x/.artifacts/surfaces/verdicts.json")?.block, true)
T("gate-tamper: edit ordinary file allows", checkGateTamperEdit("/x/apps/web/app/page.tsx"), null)
// signoff.json is the ONLY axis that grants a cell, so it has no sanctioned
// agent writer at all - an agent that can tick can certify its own work.
T("gate-tamper: redirect into signoff blocks", !!checkGateTamperBash('echo "{}" > .claude/manifests/signoff.json')?.block, true)
T("gate-tamper: node write to signoff blocks", !!checkGateTamperBash(`node -e "require('fs').writeFileSync('.claude/manifests/signoff.json','{}')"`)?.block, true)
T("gate-tamper: rm signoff blocks", !!checkGateTamperBash("rm .claude/manifests/signoff.json")?.block, true)
T("gate-tamper: cat signoff allows", checkGateTamperBash("cat .claude/manifests/signoff.json"), null)
T("gate-tamper: edit signoff blocks", !!checkGateTamperEdit("/x/.claude/manifests/signoff.json")?.block, true)
T("gate-tamper: no sanctioned tool can write signoff", !!checkGateTamperBash("node tools/surface-manifest.mjs .claude/manifests/signoff.json")?.block, true)
T("gate-tamper: edit defects blocks", !!checkGateTamperEdit("/x/.claude/manifests/defects.json")?.block, true)
// The calibration tool carries the adjudicated recall of the vision judge in its
// own source. An agent that can edit it can turn a measured 0/12 into any number.
T("gate-tamper: edit calibrate-judge blocks", !!checkGateTamperEdit("/x/tools/calibrate-judge.mjs")?.block, true)
T("gate-tamper: redirect over calibrate-judge blocks", !!checkGateTamperBash("echo x > tools/calibrate-judge.mjs")?.block, true)
T("gate-tamper: sed -i on calibrate-judge blocks", !!checkGateTamperBash("sed -i s/false/true/ tools/calibrate-judge.mjs")?.block, true)
T("gate-tamper: RUNNING calibrate-judge allows", checkGateTamperBash("node tools/calibrate-judge.mjs"), null)
T("gate-tamper: npm surfaces:calibrate allows", checkGateTamperBash("npm run surfaces:calibrate"), null)
// A file-descriptor duplication is not a write. Treating `2>&1` as one made
// every guarded tool unrunnable under the ordinary `cmd ... 2>&1` idiom.
T("gate-tamper: running calibrate-judge with 2>&1 allows", checkGateTamperBash("node tools/calibrate-judge.mjs 2>&1"), null)
T("gate-tamper: cat verdicts with 2>&1 allows", checkGateTamperBash("cat .artifacts/surfaces/verdicts.json 2>&1"), null)
T("gate-tamper: a real redirect over calibrate-judge still blocks", !!checkGateTamperBash("node x.mjs > tools/calibrate-judge.mjs 2>&1")?.block, true)

// The guard judges a command PER SEGMENT. Every case below failed under the
// previous whole-string version, and each was observed rather than imagined:
// the read blocks fired three times in one session on read-only commands, and
// both bypasses were flagged Critical on PR #560.
//
// 1. A read-only leader was matched with `^` against the ENTIRE command, so any
//    `cd` prefix or compound form blocked a pure read.
T("gate-tamper: cd prefix then read signoff allows", checkGateTamperBash('cd /c/repo && jq . .claude/manifests/signoff.json'), null)
T("gate-tamper: read manifest through a pipe allows", checkGateTamperBash("jq -r .cellCount .claude/manifests/surfaces.json 2>&1 | head"), null)
T("gate-tamper: cd with a quoted spaced path then read allows", checkGateTamperBash('cd "/c/x y/repo" && grep -c surfaceId .claude/manifests/surfaces.json'), null)
T("gate-tamper: a quoted && does not split a segment", checkGateTamperBash('grep "a && b" .claude/manifests/surfaces.json'), null)
// 2. `git` is a read-only leader and `--output=` was not a write pattern, so
//    `git log --output=<path> --format=<text>` forged a protected file and passed.
T("gate-tamper: git --output over manifest blocks", !!checkGateTamperBash("git log --output=.claude/manifests/surfaces.json --format=format:x")?.block, true)
T("gate-tamper: git -o over manifest blocks", !!checkGateTamperBash("git log -o .claude/manifests/surfaces.json")?.block, true)
T("gate-tamper: git --output over signoff blocks", !!checkGateTamperBash("git log --output=.claude/manifests/signoff.json --format=format:x")?.block, true)
// 3. The sanctioned-writer test had no end anchor, so anything chained after a
//    sanctioned tool inherited its sanction.
T("gate-tamper: chaining past a sanctioned writer blocks", !!checkGateTamperBash("node tools/surface-manifest.mjs && rm -rf .claude/manifests")?.block, true)
T("gate-tamper: semicolon chain past a sanctioned writer blocks", !!checkGateTamperBash('npm run surfaces:judge; echo fake > .artifacts/surfaces/verdicts.json')?.block, true)
// 4. Naming the containing DIRECTORY destroys every protected file at once while
//    naming none of them, so no filename pattern matched. Found by probing 3.
T("gate-tamper: rm of the manifests directory blocks", !!checkGateTamperBash("rm -rf .claude/manifests")?.block, true)
T("gate-tamper: rm of the surfaces artifacts directory blocks", !!checkGateTamperBash("rm -rf .artifacts/surfaces")?.block, true)
T("gate-tamper: listing the manifests directory allows", checkGateTamperBash("ls -la .claude/manifests"), null)
T("gate-tamper: a bare cd into the manifests directory allows", checkGateTamperBash("cd .claude/manifests"), null)
// A bare filename after a cd is still the protected artifact.
T("gate-tamper: cd then read a bare signoff filename allows", checkGateTamperBash("cd .claude/manifests && cat signoff.json"), null)
T("gate-tamper: cd then rm a bare signoff filename blocks", !!checkGateTamperBash("cd .claude/manifests && rm signoff.json")?.block, true)
// An unknown leader fails CLOSED: the allowlist is of shape, not of verbs.
T("gate-tamper: unknown interpreter writing signoff blocks", !!checkGateTamperBash(`python -c "open('.claude/manifests/signoff.json','w')"`)?.block, true)
// 5. A heredoc BODY is data, not commands. A commit message DESCRIBING a write
//    was blocked as if it were one, which is how this was found.
T("gate-tamper: a heredoc body describing a write allows", checkGateTamperBash("git commit -F - <<'EOF'\nfix: stop rm signoff.json from working\nrm -rf .claude/manifests was allowed\nEOF"), null)
T("gate-tamper: a real redirect on the heredoc command line still blocks", !!checkGateTamperBash("cat <<'EOF' > .claude/manifests/signoff.json\n{}\nEOF")?.block, true)
T("gate-tamper: tee from a heredoc still blocks", !!checkGateTamperBash("tee .claude/manifests/signoff.json <<'EOF'\n{}\nEOF")?.block, true)

// 6. The guard was scoped to COMMAND SHAPE (an allowlist of read-only leaders)
//    rather than to write intent, so any shell CONTROL STRUCTURE that merely
//    NAMED a protected file was blocked: the leader is `for` / `if` / `do`, not
//    a command, so it can never be on a leader allowlist. Reproduced live three
//    times in one session on pure reads, which is what sent this back for a
//    rewrite. A control keyword performs no action by itself; the write-verb,
//    output-flag and redirect checks run leader-independently and still catch a
//    write inside the body (`do rm signoff.json` blocks below).
T("gate-tamper: a for-loop naming signoff in its list allows", checkGateTamperBash(`for f in a.md .claude/manifests/signoff.json b.md; do printf "%s" "$(wc -l < "$f")"; done`), null)
T("gate-tamper: a for-loop naming the manifest allows", checkGateTamperBash(`for f in a.md .claude/manifests/surfaces.json; do wc -l < "$f"; done`), null)
T("gate-tamper: an if-test on signoff allows", checkGateTamperBash("if [ -f .claude/manifests/signoff.json ]; then echo yes; fi"), null)
T("gate-tamper: a while-read over the manifest allows", checkGateTamperBash("while read -r line; do echo \"$line\"; done < .claude/manifests/surfaces.json"), null)
T("gate-tamper: a write inside a loop body still blocks", !!checkGateTamperBash("for f in x; do rm .claude/manifests/signoff.json; done")?.block, true)
T("gate-tamper: a redirect inside a loop body still blocks", !!checkGateTamperBash("for f in x; do echo {} > .claude/manifests/signoff.json; done")?.block, true)
// 7. `2>/dev/null` is a redirect to the NULL DEVICE, not a write to any file,
//    but it contains `>` and so failed the redirect test - which blocked the
//    single most common read idiom there is. `2>&1` was already exempt; the
//    null device was not.
T("gate-tamper: a read with 2>/dev/null allows", checkGateTamperBash("wc -l < .claude/manifests/surfaces.json 2>/dev/null"), null)
T("gate-tamper: a read with 2>NUL allows", checkGateTamperBash("cat .claude/manifests/signoff.json 2>NUL"), null)
T("gate-tamper: a redirect to a real file still blocks", !!checkGateTamperBash("echo x > .claude/manifests/surfaces.json 2>/dev/null")?.block, true)
// Interpreters stay fail-CLOSED on purpose: a string of arbitrary code cannot be
// classified soundly, and blocklisting write APIs inside it is the whack-a-mole
// CLAUDE.md's shell-allowlist section exists to forbid. The block message now
// names the Read tool instead of claiming `cat/jq` is enough, because that
// claim was false for every command in group 6 above.
T("gate-tamper: node -e over signoff stays blocked", !!checkGateTamperBash(`node -e "require('fs').readFileSync('.claude/manifests/signoff.json')"`)?.block, true)
T("gate-tamper: unknown interpreter reading signoff stays blocked", !!checkGateTamperBash(`python -c "open('.claude/manifests/signoff.json')"`)?.block, true)

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
// One UNIQUE fixture root per run. The previous fixed path (tmpdir()/orbit-hook-parity)
// was shared by every invocation: a second concurrent run (CI + local, or two clones)
// began by rmSync'ing the first run's LIVE fixtures, which surfaced as false
// ownership-gate verdicts inside the suite and as an uncaught crash mid-flight; and a
// leftover dir with a held Windows handle made that same module-level rmSync throw
// EPERM after 195 green tests. mkdtempSync removes the pre-clean entirely - there is
// nothing to fight over and nothing stale to trip on. Cleanup is registered on exit,
// best-effort: a leaked tmp dir is garbage, never a verdict.
const root = mkdtempSync(join(tmpdir(), "orbit-hook-parity-"))
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})
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

const tamperHook = (payload) => runHook("forbid-gate-tamper.mjs", payload)
T("cc gate-tamper: touch PAUSED -> 2", tamperHook({ tool_name: "Bash", tool_input: { command: "touch .claude/manifests/PAUSED" } }), 2)
T("cc gate-tamper: cat manifest -> 0", tamperHook({ tool_name: "Bash", tool_input: { command: "cat .claude/manifests/surfaces.json" } }), 0)
T("cc gate-tamper: rm manifest -> 2", tamperHook({ tool_name: "Bash", tool_input: { command: "rm .claude/manifests/surfaces.json" } }), 2)
T("cc gate-tamper: Write PAUSED -> 2", tamperHook({ tool_name: "Write", tool_input: { file_path: "/x/.claude/manifests/PAUSED", content: "" } }), 2)
T("cc gate-tamper: Write verdicts -> 2", tamperHook({ tool_name: "Write", tool_input: { file_path: "/x/.artifacts/surfaces/verdicts.json", content: "{}" } }), 2)
T("cc gate-tamper: ordinary command -> 0", tamperHook({ tool_name: "Bash", tool_input: { command: "npm run build" } }), 0)

// The Stop gate itself, against disposable fixture roots (ORBIT_SURFACE_ROOT).
// Polarity is the point under test: armed BY DEFAULT when the manifest exists,
// disarmed only by completion, a human PAUSED file, or having no manifest.
function runHookEnv(file, payload, env) {
  const res = spawnSync(process.execPath, [join(hooksDir, file)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
  return res.status
}
// The gate fixture is a REAL git repo: the touched axis is a visual-signature
// diff against a baseline commit, so a stubbed tree would test nothing. The
// baseline is the fixture's initial commit; `worked` decides whether the
// surface's owned file is restyled afterwards.
// The depth floor is a PERCENTAGE of a surface's render-affecting tokens, so these
// fixtures have to be big enough for a one-value tweak to be a small fraction, the
// way it is in a real component. A three-token fixture would make every edit look
// like a rewrite and the floor would never be exercised.
const BASE_TSX = `export default function P(){
  return (
    <div className="p-4 gap-4 rounded-xl border">
      <header className="flex items-center gap-2">
        <span className="text-sm font-medium">Calendar</span>
        <button className="px-3 py-1 rounded-md">Today</button>
      </header>
      <ul className="mt-4 grid grid-cols-7 gap-1">
        <li className="h-10 text-center">1</li>
        <li className="h-10 text-center">2</li>
      </ul>
      <footer className="mt-4 text-xs">Best streak</footer>
    </div>
  )
}
`
// A one-value tweak on an otherwise identical tree.
const SHALLOW_TSX = BASE_TSX.replace('className="p-4 gap-4 rounded-xl border"', 'className="p-8 gap-4 rounded-xl border"')
// A real redesign: elements, classes and copy all move together.
const WORKED_TSX = `export default function P(){
  return (
    <section className="px-6 py-8 gap-6 rounded-3xl bg-elev">
      <nav className="inline-flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Month</h2>
        <PillButton variant="ghost" size="sm">Jump to now</PillButton>
      </nav>
      <ol className="mt-6 flex flex-col gap-2">
        <DayRow index={1} state="done" />
        <DayRow index={2} state="overdue" />
      </ol>
      <aside className="mt-6 text-sm text-fg-3">Longest run</aside>
    </section>
  )
}
`
function buildGateFixture(
  name,
  { withManifest = true, withPaused = false, worked = true, shallow = false, judged = null, signed = false, blocker = false, status = "transformed", pixelEvidence = "web-capture", brokenManifest = false } = {},
) {
  const fixtureRoot = join(root, `gate-${name}`)
  mkdirSync(join(fixtureRoot, ".claude", "manifests"), { recursive: true })
  mkdirSync(join(fixtureRoot, "src"), { recursive: true })
  const surfaceFile = join(fixtureRoot, "src", "page.tsx")
  writeFileSync(surfaceFile, BASE_TSX)

  const git = (...args) => spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" })
  git("init", "-q")
  git("config", "user.email", "t@example.com")
  git("config", "user.name", "t")
  git("add", "-A")
  git("commit", "-qm", "baseline")
  if (shallow) writeFileSync(surfaceFile, SHALLOW_TSX)
  else if (worked) writeFileSync(surfaceFile, WORKED_TSX)

  const cell = {
    surfaceId: "s1",
    platform: "web",
    kind: "route",
    state: "default",
    sourceFile: "src/page.tsx",
    ownedFiles: ["src/page.tsx"],
    theme: "light",
    locale: "en",
    pixelEvidence,
  }
  // `cells` as a non-iterable is parseable JSON that makes the oracle THROW, which
  // is the only way to reach the gate's catch block on purpose. It is the fault
  // injection for the fail-closed assertion below.
  const manifest = brokenManifest
    ? { generatedFrom: "test", baselineRef: "HEAD", baselineSha: "HEAD", cells: 5 }
    : { generatedFrom: "test", baselineRef: "HEAD", baselineSha: "HEAD", cells: [cell] }
  if (withManifest) writeFileSync(join(fixtureRoot, ".claude", "manifests", "surfaces.json"), JSON.stringify(manifest))
  if (withPaused) writeFileSync(join(fixtureRoot, ".claude", "manifests", "PAUSED"), "")

  // The evidence files are keyed to the surface signature, so the fixture asks
  // the real oracle for it instead of hardcoding a hash that would rot.
  const signature = surfaceSignatureFor(fixtureRoot)
  if (judged)
    writeFileSync(
      join(fixtureRoot, ".claude", "manifests", "defects.json"),
      JSON.stringify({
        version: 1,
        cells: {
          "s1--default--light--en": {
            surfaceSignature: judged === "stale" ? "STALE-SIGNATURE" : signature,
            status,
            findings: blocker ? [{ severity: "blocker", issue: "text overflows its container" }] : [],
          },
        },
      }),
    )
  if (signed)
    writeFileSync(
      join(fixtureRoot, ".claude", "manifests", "signoff.json"),
      JSON.stringify({ version: 1, cells: { "s1--default--light--en": { surfaceSignature: signature, by: "thomas" } } }),
    )
  return fixtureRoot
}

/** Ask the real oracle for the fixture surface's signature, so tests never hardcode a hash. */
function surfaceSignatureFor(fixtureRoot) {
  const res = spawnSync(process.execPath, [join(hooksDir, "..", "..", "tools", "check-surface-coverage.mjs"), "--json"], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  })
  const parsed = JSON.parse(res.stdout || "{}")
  return parsed?.results?.[0]?.surfaceSignature ?? ""
}
const gateStatus = (fixtureRoot, payload = {}) => runHookEnv("surface-coverage-gate.mjs", payload, { ORBIT_SURFACE_ROOT: fixtureRoot })
/** Point the gate at a transcript whose last assistant message is `text`. */
function saidInTranscript(fixtureRoot, text) {
  const transcriptPath = join(fixtureRoot, "transcript.jsonl")
  writeFileSync(transcriptPath, JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } }) + "\n")
  return { transcript_path: transcriptPath }
}
const CLAIM = "The visual pass is complete - all surfaces now carry the new design."
const CLAIM_WITH_RATIO = "The visual pass is complete for this slice. Honest ratio: 0/1 cells verified."
const NO_CLAIM = "I refactored the drive engine and removed its cost accounting."
const gateSaid = (fixtureRoot, text, payload = {}) => gateStatus(fixtureRoot, { ...saidInTranscript(fixtureRoot, text), ...payload })

T("cc surface-gate: no manifest -> 0 (not armed)", gateStatus(buildGateFixture("none", { withManifest: false })), 0)
T("cc surface-gate: PAUSED -> 0 (human disarm)", gateStatus(buildGateFixture("paused", { withPaused: true })), 0)
// The anti-shredding property: a turn that claims nothing ends silently no matter the ratio, so a
// headless drive child's {"status":...} line survives (#539 post-mortem, 2026-07-19).
T("cc surface-gate: shortfall + no completion claim -> 0", gateSaid(buildGateFixture("noclaim"), NO_CLAIM), 0)
T("cc surface-gate: shortfall + no transcript -> 0", gateStatus(buildGateFixture("notranscript")), 0)
T("cc surface-gate: claim + unjudged -> 2", gateSaid(buildGateFixture("unjudged"), CLAIM), 2)
T("cc surface-gate: claim + honest ratio stated -> 0", gateSaid(buildGateFixture("honest"), CLAIM_WITH_RATIO), 0)
T("cc surface-gate: stop_hook_active loop guard -> 0", gateSaid(buildGateFixture("loop"), CLAIM, { stop_hook_active: true }), 0)
// A verifier that ERRORS is UNKNOWN, never a clean pass. The catch block used to
// exit 0, so a broken gate was indistinguishable from a satisfied one - the exact
// thing the "Fail-closed the completion gate" ADR forbids, in the file it was
// written about. The loop guard still wins, so a broken gate cannot wedge a session.
T("cc surface-gate: internal error + claim -> 2 (fail closed)", gateSaid(buildGateFixture("errored", { brokenManifest: true }), CLAIM), 2)
T(
  "cc surface-gate: internal error after a block -> 0 (cannot wedge the session)",
  gateSaid(buildGateFixture("errored-loop", { brokenManifest: true }), CLAIM, { stop_hook_active: true }),
  0,
)
// All three axes satisfied is the only way a claim passes silently.
T(
  "cc surface-gate: claim + touched+judged+signed -> 0",
  gateSaid(buildGateFixture("done", { judged: "fresh", signed: true }), CLAIM),
  0,
)

// ---------------------------------------------------------------------------
// The completion oracle's own guarantees (#539 harness rebuild, 2026-07-19).
// These are the properties six sessions asserted in prose and never checked.
// ---------------------------------------------------------------------------
console.log("\n# visual completion oracle")
const oracle = (fixtureRoot) => {
  const res = spawnSync(process.execPath, [join(hooksDir, "..", "..", "tools", "check-surface-coverage.mjs"), "--json"], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  })
  return JSON.parse(res.stdout || "{}")
}
const oracleText = (fixtureRoot) =>
  spawnSync(process.execPath, [join(hooksDir, "..", "..", "tools", "check-surface-coverage.mjs")], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  }).stdout

// 1. An UNTOUCHED surface can never be done, however much other evidence exists.
//    This is the route-explore property: byte-identical to the pre-#539 baseline,
//    yet the old judge scored it "transformed" on both votes.
const untouched = oracle(buildGateFixture("untouched", { worked: false, judged: "fresh", signed: true }))
T("oracle: unchanged surface is not touched", untouched.results?.[0]?.touched, false)
T("oracle: unchanged surface is never done", untouched.complete, false)

// 1b. EDITED IS NOT REDESIGNED. The whole point of the depth floor: a surface that
// was genuinely edited, but only barely, must NOT count as worked on. Until
// 2026-07-19 `touched` was `changed.length > 0`, so a one-class tweak reported
// exactly what a rebuilt screen reported - and ten drive runs said "done" over an
// app whose calendar had moved 9.6% and whose Today screen had moved 0.0%.
const shallow = oracle(buildGateFixture("shallow", { shallow: true }))
T("oracle: a shallow edit is NOT touched (edited != redesigned)", shallow.results?.[0]?.touched, false)
T("oracle: a shallow edit is never done", shallow.complete, false)
T("oracle: shallow cell says too-shallow, not untouched", /too-shallow/.test(String(shallow.failures?.[0]?.reasons)), true)
T("oracle: shallow reason reports the measured percentage", /% of this surface/.test(String(shallow.failures?.[0]?.reasons)), true)
// A real redesign still clears the floor, so the gate is not simply always-red.
T("oracle: a real redesign still counts as touched", oracle(buildGateFixture("deep")).results?.[0]?.touched, true)

// 2. NOTHING automatic grants: touched + judge-clear without a human tick is not done.
const unsigned = oracle(buildGateFixture("unsigned", { judged: "fresh" }))
T("oracle: touched + judged but unsigned is not done", unsigned.complete, false)
T("oracle: unsigned cell names the missing human grant", /unsigned/.test(String(unsigned.failures?.[0]?.reasons)), true)

// 3. The judge can VETO. A blocker finding withholds a cell even when signed.
const vetoed = oracle(buildGateFixture("veto", { judged: "fresh", signed: true, blocker: true }))
T("oracle: a blocker finding vetoes an otherwise-complete cell", vetoed.complete, false)

// 3b. A judge STATUS can veto even with zero blocker findings. Without this a
//     surface the judge scored "default" (explicitly not redesigned) counted as
//     defect-clear because all its findings were major/minor.
const stillDefault = oracle(buildGateFixture("brokenstatus", { judged: "fresh", signed: true, status: "broken" }))
T("oracle: a broken judge status vetoes even with no blocker finding", stillDefault.complete, false)
const unseen = oracle(buildGateFixture("noartifact", { judged: "fresh", signed: true, status: "no-artifact" }))
T("oracle: a surface the judge could not see is UNKNOWN, not clean", unseen.complete, false)

// 3c. A cell whose pixels can NEVER be obtained (every mobile cell, every
//     non-default state) must not demand a judge report. Requiring one made
//     `done` mathematically unreachable for 348 of 804 cells - an unsatisfiable
//     gate rather than a strict one.
const noPixels = oracle(buildGateFixture("nopixels", { signed: true, pixelEvidence: "none" }))
T("oracle: a cell with no obtainable screenshot does not demand a judge report", noPixels.complete, true)
T("oracle: ...and still requires the human tick", oracle(buildGateFixture("nopixunsigned", { pixelEvidence: "none" })).complete, false)

// 4. Evidence is pinned to the surface signature, so a stale report cannot carry.
const staleJudge = oracle(buildGateFixture("stalejudge", { judged: "stale", signed: true }))
T("oracle: a judge report for a different signature does not count", staleJudge.complete, false)

// 5. DETERMINISM. Two runs over an unchanged tree must be byte-identical; the
//    old oracle drifted 16 -> 20 -> 19 -> 20 with nobody editing.
const twiceRoot = buildGateFixture("twice", { judged: "fresh", signed: true })
T("oracle: two runs on an unchanged tree are byte-identical", oracleText(twiceRoot) === oracleText(twiceRoot), true)

// 6. HONESTY AS CODE. Every human-readable run states its own scope, so a
//    partial number can never be read as whole-app coverage. This replaces the
//    prose sentence whose only measured effect was shredding a status line.
const scopeText = oracleText(twiceRoot)
T("oracle: output always states its scope", /^SCOPE:/m.test(scopeText), true)
T("oracle: output always names the human-signed axis", /human-signed/.test(scopeText), true)
T("oracle: output always names the baseline it compares against", /baseline /.test(scopeText), true)

// 7. FAIL CLOSED. An unresolvable baseline makes every file look new, which
//    would silently satisfy the touched axis for the whole app.
const noGitRoot = join(root, "gate-nogit")
mkdirSync(join(noGitRoot, ".claude", "manifests"), { recursive: true })
mkdirSync(join(noGitRoot, "src"), { recursive: true })
writeFileSync(join(noGitRoot, "src", "page.tsx"), WORKED_TSX)
writeFileSync(
  join(noGitRoot, ".claude", "manifests", "surfaces.json"),
  JSON.stringify({
    generatedFrom: "test",
    baselineRef: "deadbeef",
    baselineSha: "deadbeef",
    cells: [{ surfaceId: "s1", platform: "web", kind: "route", state: "default", sourceFile: "src/page.tsx", ownedFiles: ["src/page.tsx"], theme: "light", locale: "en" }],
  }),
)
const unresolvable = oracle(noGitRoot)
T("oracle: unresolvable baseline is UNKNOWN, not touched", unresolvable.results?.[0]?.touched, false)
T("oracle: unresolvable baseline says so explicitly", /baseline-unresolvable/.test(String(unresolvable.failures?.[0]?.reasons)), true)

// ---------------------------------------------------------------------------
// workorder contract (per-order --check verdicts, regeneration, folding).
// Each property below shipped broken once: --check --id exited 0 over 68
// violations, a regeneration deleted the plan order --from-plan had just
// written, and three Today views carried 24 cells no work order could move.
// ---------------------------------------------------------------------------
console.log("\n# workorder contract")
const workorderTool = join(hooksDir, "..", "..", "tools", "workorder.mjs")
const runWorkorder = (fixtureRoot, args = []) =>
  spawnSync(process.execPath, [workorderTool, ...args], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  })

function workorderCell(surfaceId, sourceFile, overrides = {}) {
  return {
    surfaceId,
    platform: "web",
    kind: "route",
    state: "default",
    theme: "light",
    locale: "en",
    sourceFile,
    ownedFiles: [sourceFile],
    pixelEvidence: "web-capture",
    ...overrides,
  }
}

// A real git repo, like the gate fixtures above: the depth line is a signature
// diff against a baseline commit, so a stubbed tree would test nothing.
function buildWorkorderFixture(name, { cells, suppressions = null } = {}) {
  const fixtureRoot = join(root, `wo-${name}`)
  mkdirSync(join(fixtureRoot, ".claude", "manifests"), { recursive: true })
  mkdirSync(join(fixtureRoot, "apps", "web", "app"), { recursive: true })
  writeFileSync(join(fixtureRoot, "apps", "web", "app", "page.tsx"), BASE_TSX)
  const git = (...args) => spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" })
  git("init", "-q")
  git("config", "user.email", "t@example.com")
  git("config", "user.name", "t")
  git("add", "-A")
  git("commit", "-qm", "baseline")
  if (suppressions) writeFileSync(join(fixtureRoot, "apps", "web", "eslint-suppressions.json"), JSON.stringify(suppressions))
  writeFileSync(
    join(fixtureRoot, ".claude", "manifests", "surfaces.json"),
    JSON.stringify({ generatedFrom: "test", baselineRef: "HEAD", baselineSha: "HEAD", cells }),
  )
  return fixtureRoot
}

const woDebt = buildWorkorderFixture("debt", {
  cells: [workorderCell("r-cal", "apps/web/app/page.tsx")],
  suppressions: { "app/page.tsx": { "local/spacing-scale": { count: 3 } } },
})
const debtVerdict = runWorkorder(woDebt, ["--check", "--id", "r-cal"])
T("workorder: --check --id with debt exits 1", debtVerdict.status, 1)
T("workorder: --check --id prints the order's own debt rows", /apps\/web\/app\/page\.tsx {2}local\/spacing-scale {2}3/.test(debtVerdict.stdout), true)
T("workorder: --check --id prints the depth veto axis", /depth 0\.0% vs floor 30%/.test(debtVerdict.stdout), true)

const woClean = buildWorkorderFixture("clean", { cells: [workorderCell("r-cal", "apps/web/app/page.tsx")] })
const cleanVerdict = runWorkorder(woClean, ["--check", "--id", "r-cal"])
T("workorder: --check --id without debt exits 0", cleanVerdict.status, 0)
// The load-bearing half of the depth contract: 0.0% is far below the floor,
// and the exit code above is still 0 - depth reports, it never vetoes here.
T("workorder: the depth line never moves the exit code", /depth 0\.0% vs floor 30%/.test(cleanVerdict.stdout), true)

const globalVerdict = runWorkorder(woDebt, ["--check"])
T("workorder: global --check with any debt exits 1", globalVerdict.status, 1)
T("workorder: global --check prints a greppable per-order DEBT line", /^DEBT r-cal {2}3 {2}worst: apps\/web\/app\/page\.tsx \(3\)/m.test(globalVerdict.stdout), true)
T("workorder: global --check prints the one-line depth summary", /^depth: 1 of 1 surface orders at 0% depth, 1 below the 30% floor/m.test(globalVerdict.stdout), true)

// A malformed per-order command must be a loud exit 2, never a silent
// fall-through to the GLOBAL check: the child would read the repo-wide
// verdict as its own order's.
const missingId = runWorkorder(woDebt, ["--check", "--id"])
T("workorder: --check --id with a missing value exits 2", missingId.status, 2)
T("workorder: ...and never runs the global check instead", /^DEBT /m.test(missingId.stdout), false)
T("workorder: --id with a flag-like value exits 2", runWorkorder(woDebt, ["--id", "--check"]).status, 2)
T("workorder: --from-plan with no path exits 2", runWorkorder(woDebt, ["--from-plan"]).status, 2)

const woRegen = buildWorkorderFixture("regen", { cells: [workorderCell("r-cal", "apps/web/app/page.tsx")] })
mkdirSync(join(woRegen, ".claude", "plans"), { recursive: true })
// The plan names a file NO surface owns: --from-plan refuses a surface-owned
// file now (exclusive ownership), and that refusal has its own tests below.
writeFileSync(join(woRegen, ".claude", "plans", "issue-9.plan.md"), "# Plan: issue-9\n\n## Files to Change\n\n- EDIT `apps/web/lib/notify.ts`\n")
const fromPlan = runWorkorder(woRegen, ["--from-plan", ".claude/plans/issue-9.plan.md"])
T("workorder: --from-plan writes the plan order", fromPlan.status === 0 && existsSync(join(woRegen, ".claude", "workorders", "issue-9.md")), true)
T("workorder: --check --id answers for a plan order too", runWorkorder(woRegen, ["--check", "--id", "issue-9"]).status, 0)
T("workorder: re-running --from-plan on the SAME plan stays exit 0 (idempotent)", runWorkorder(woRegen, ["--from-plan", ".claude/plans/issue-9.plan.md"]).status, 0)
writeFileSync(join(woRegen, ".claude", "workorders", "stale-route.md"), "---\nsurfaceId: stale-route\nkind: route\n---\n\n# Work order: stale-route\n")
const regen = runWorkorder(woRegen)
T("workorder: regeneration exits 0", regen.status, 0)
T("workorder: regeneration preserves the plan order (step 9 must not destroy step 6)", existsSync(join(woRegen, ".claude", "workorders", "issue-9.md")), true)
T("workorder: regeneration still sweeps a stale manifest-derived order", existsSync(join(woRegen, ".claude", "workorders", "stale-route.md")), false)
T("workorder: INDEX.md lists the plan order it sits next to", /\[issue-9\]\(issue-9\.md\)/.test(readFileSync(join(woRegen, ".claude", "workorders", "INDEX.md"), "utf8")), true)

// Two views, one sourceFile: the view-today shape. The secondary must fold into
// the primary instead of surviving as an order that owns nothing and forbids
// every edit that could move its cells.
const woFold = buildWorkorderFixture("fold", {
  cells: [
    workorderCell("v-today", "apps/web/app/page.tsx", { kind: "view" }),
    workorderCell("v-all", "apps/web/app/page.tsx", { kind: "view" }),
  ],
})
const foldRegen = runWorkorder(woFold)
T("workorder: a zero-owned view folds into its sourceFile's primary owner", foldRegen.status, 0)
T("workorder: the folded id gets no file of its own", existsSync(join(woFold, ".claude", "workorders", "v-all.md")), false)
const primaryBody = readFileSync(join(woFold, ".claude", "workorders", "v-today.md"), "utf8")
T("workorder: the primary order names the folded id and carries its cells", /- `v-all`/.test(primaryBody) && /cells: 2/.test(primaryBody), true)
T("workorder: INDEX.md shows the folded id as folded into the primary", /`v-all` folded into \[v-today\]\(v-today\.md\)/.test(readFileSync(join(woFold, ".claude", "workorders", "INDEX.md"), "utf8")), true)

// A zero-owned unit whose sourceFile nobody owns has no fold target. That must
// fail generation loudly, naming the unit - cells reachable through no work
// order is the exact shape of work that never gets done.
const woOrphan = buildWorkorderFixture("orphan", {
  cells: [
    workorderCell("r-shared", "apps/web/app/page.tsx"),
    workorderCell("r-orphan", "apps/web/app/orphan.tsx", { ownedFiles: ["apps/web/app/page.tsx"] }),
  ],
})
const orphanRun = runWorkorder(woOrphan)
T("workorder: a zero-owned unit with no fold target fails generation (exit 2)", orphanRun.status, 2)
T("workorder: the zero-owned invariant names the stranded unit", /r-orphan/.test(orphanRun.stderr), true)

// ---------------------------------------------------------------------------
// workorder: exclusive ownership at --from-plan time, and a definition of done
// that stays satisfiable. All three shipped broken once: a plan named after a
// surface CLOBBERED the surface's order in place (kind flipped route -> plan),
// a plan granted a surface-owned file exclusively to a second bundle, and
// clearing a residual order's LAST violation made its own done command exit 2
// "no work order" - the reward for finishing was a recorded failure.
// ---------------------------------------------------------------------------
const woGuard = buildWorkorderFixture("guard", {
  cells: [workorderCell("r-cal", "apps/web/app/page.tsx")],
  suppressions: {
    "app/shared.ts": { "local/spacing-scale": { count: 2 } },
    "app/page.tsx": { "local/spacing-scale": { count: 3 } },
  },
})
mkdirSync(join(woGuard, ".claude", "plans"), { recursive: true })
runWorkorder(woGuard)
T("workorder: generated done commands single-quote the id", /--check --id 'r-cal'/.test(readFileSync(join(woGuard, ".claude", "workorders", "r-cal.md"), "utf8")), true)

writeFileSync(join(woGuard, ".claude", "plans", "overlap.plan.md"), "# Plan\n\n## Files to Change\n\n- EDIT `apps/web/app/page.tsx`\n")
const overlapRefusal = runWorkorder(woGuard, ["--from-plan", ".claude/plans/overlap.plan.md"])
T("workorder: --from-plan refuses a surface-owned file (exit 2)", overlapRefusal.status, 2)
T("workorder: ...naming the file and its owning surface", /apps\/web\/app\/page\.tsx/.test(overlapRefusal.stderr) && /r-cal/.test(overlapRefusal.stderr), true)
T("workorder: ...and the refusal writes nothing", existsSync(join(woGuard, ".claude", "workorders", "overlap.md")), false)

writeFileSync(join(woGuard, ".claude", "plans", "r-cal.plan.md"), "# Plan\n\n## Files to Change\n\n- EDIT `apps/web/lib/free.ts`\n")
const clobberRefusal = runWorkorder(woGuard, ["--from-plan", ".claude/plans/r-cal.plan.md"])
T("workorder: --from-plan refuses an id collision with a manifest order (exit 2)", clobberRefusal.status, 2)
T("workorder: ...saying whose id it would clobber", /r-cal/.test(clobberRefusal.stderr) && /clobber/.test(clobberRefusal.stderr), true)
T("workorder: ...and the manifest order survives untouched", /^kind: route$/m.test(readFileSync(join(woGuard, ".claude", "workorders", "r-cal.md"), "utf8")), true)

writeFileSync(join(woGuard, ".claude", "plans", "issue-77.plan.md"), "# Plan\n\n## Files to Change\n\n- EDIT `apps/web/lib/free.ts`\n")
T("workorder: --from-plan on an unowned file still passes", runWorkorder(woGuard, ["--from-plan", ".claude/plans/issue-77.plan.md"]).status, 0)
writeFileSync(join(woGuard, ".claude", "plans", "issue-78.plan.md"), "# Plan\n\n## Files to Change\n\n- EDIT `apps/web/lib/free.ts`\n")
const planVsPlan = runWorkorder(woGuard, ["--from-plan", ".claude/plans/issue-78.plan.md"])
T("workorder: --from-plan refuses a file another plan order owns", planVsPlan.status, 2)
T("workorder: ...naming the owning plan order", /issue-77/.test(planVsPlan.stderr), true)

// residual-web-app derives from app/shared.ts's ledger entry alone. Clearing it
// is exactly what the order's Backlog A demands, and the id stops deriving.
const residualPath = join(woGuard, ".claude", "workorders", "residual-web-app.md")
const residualBody = readFileSync(residualPath, "utf8")
T("workorder: the residual order text carries the sanctioned escape", /eslint-disable-next-line/.test(residualBody), true)
T("workorder: the residual order no longer orders zero rendered change", /without changing (rendered behaviour|what they render)/.test(residualBody), false)
writeFileSync(join(woGuard, "apps", "web", "eslint-suppressions.json"), JSON.stringify({ "app/page.tsx": { "local/spacing-scale": { count: 3 } } }))
const clearedResidual = runWorkorder(woGuard, ["--check", "--id", "residual-web-app"])
T("workorder: a fully-cleared residual's done command exits 0", clearedResidual.status, 0)
T("workorder: ...with the honest swept-on-next-regeneration note", /no longer derives/.test(clearedResidual.stdout) && /sweep/.test(clearedResidual.stdout), true)
T("workorder: an unknown id still exits 2", runWorkorder(woGuard, ["--check", "--id", "no-such-order"]).status, 2)
// The fallback reads Boundaries off the child-writable .md, so pin the
// anti-gaming property: annexing files into Boundaries can only ADD debt.
writeFileSync(residualPath, residualBody.replace("- `apps/web/app/shared.ts`", "- `apps/web/app/shared.ts`\n- `apps/web/app/page.tsx`"))
const annexed = runWorkorder(woGuard, ["--check", "--id", "residual-web-app"])
T("workorder: annexing a debt-carrying file into the cleared order exits 1", annexed.status, 1)

// ---------------------------------------------------------------------------
// check-diff-ownership gate. The property under test is d4's fix: the generated
// prompt itself orders edits to the suppression ledger, a test file and the
// i18n pair, so obeying the prompt must not fail the prompt's own gate. The
// three permitted classes are structural; everything else must keep failing.
// ---------------------------------------------------------------------------
console.log("\n# check-diff-ownership gate")
const ownershipTool = join(hooksDir, "..", "..", "tools", "check-diff-ownership.mjs")
const runOwnership = (fixtureRoot, args) =>
  spawnSync(process.execPath, [ownershipTool, ...args, "--base", "HEAD"], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  })

const ownershipOrder = (id, ownedFile) =>
  `---\nsurfaceId: ${id}\nkind: route\n---\n\n# Work order: ${id}\n\n## Boundaries: you own these files, and only these\n\n- \`${ownedFile}\`\n\n## Backlog A: enumerated\n\n(none)\n`

function buildOwnershipFixture(name, extraFiles = {}) {
  const fixtureRoot = join(root, `own-${name}`)
  const fixWrite = (rel, body) => {
    const p = join(fixtureRoot, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, body)
  }
  fixWrite("apps/mobile/app/login-styles.ts", "export const gap = 14\n")
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 14\n")
  fixWrite(
    "apps/mobile/eslint-suppressions.json",
    JSON.stringify({ "app/login-styles.ts": { "local/spacing-scale": { count: 2 } }, "app/other-styles.ts": { "local/spacing-scale": { count: 2 } } }),
  )
  fixWrite("packages/shared/src/i18n/en.json", '{"a":"Hi"}\n')
  fixWrite("packages/shared/src/i18n/pt-BR.json", '{"a":"Oi"}\n')
  fixWrite(".claude/workorders/wo-login.md", ownershipOrder("wo-login", "apps/mobile/app/login-styles.ts"))
  for (const [rel, body] of Object.entries(extraFiles)) fixWrite(rel, body)
  const git = (...args) => spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" })
  git("init", "-q")
  git("config", "user.email", "t@example.com")
  git("config", "user.name", "t")
  // Line endings are pinned per-fixture: under the machine's autocrlf a CRLF
  // body would be normalized at add time, and the CRLF-at-base test below
  // would silently commit (and so test) an LF blob.
  git("config", "core.autocrlf", "false")
  git("add", "-A")
  git("commit", "-qm", "baseline")
  return { fixtureRoot, fixWrite }
}

// The full d4 shape in ONE diff: owned source fixed, its own suppression count
// reduced, its conventional test companion created, both locale files edited.
{
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("legit")
  fixWrite("apps/mobile/app/login-styles.ts", "export const gap = 12\n")
  fixWrite(
    "apps/mobile/eslint-suppressions.json",
    JSON.stringify({ "app/login-styles.ts": { "local/spacing-scale": { count: 1 } }, "app/other-styles.ts": { "local/spacing-scale": { count: 2 } } }),
  )
  fixWrite("apps/mobile/__tests__/app/login-styles.test.ts", "import { gap } from '../../app/login-styles'\n")
  fixWrite("packages/shared/src/i18n/en.json", '{"a":"Hi","b":"New"}\n')
  fixWrite("packages/shared/src/i18n/pt-BR.json", '{"a":"Oi","b":"Novo"}\n')
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: obeying the prompt (source + test + prune + i18n pair) exits 0", verdict.status, 0)
}
{
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("escape")
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 12\n")
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: an unowned source file still exits 1", verdict.status, 1)
  T("ownership: the escape names the unowned file", /other-styles\.ts/.test(verdict.stderr), true)
}
{
  // The scoreboard moving on its own: a count falls for a file the diff never
  // edited. The suppressions file being always-permitted must NOT weaken this.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("faked")
  fixWrite(
    "apps/mobile/eslint-suppressions.json",
    JSON.stringify({ "app/login-styles.ts": { "local/spacing-scale": { count: 2 } }, "app/other-styles.ts": { "local/spacing-scale": { count: 1 } } }),
  )
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: a suppression count falling for an unedited file still exits 1", verdict.status, 1)
  T("ownership: ...and says the baseline moved without the code", /SUPPRESSION BASELINE MOVED/.test(verdict.stderr), true)
}
{
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("gatestate")
  fixWrite(".claude/manifests/surfaces.json", "{}")
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: gate state still exits 1", verdict.status, 1)
  T("ownership: ...and is named as gate state", /GATE STATE TOUCHED/.test(verdict.stderr), true)
}
{
  // A test file is only a companion when its SOURCE counterpart is owned;
  // otherwise it belongs to whoever owns that source.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("foreigntest")
  fixWrite("apps/mobile/__tests__/app/other-styles.test.ts", "import { pad } from '../../app/other-styles'\n")
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: a test whose source is not owned still exits 1", verdict.status, 1)
}
{
  // The second real naming shape: `challenges-page.test.tsx` for an owned
  // router `challenges/page.tsx`.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("pagetest", {
    "apps/web/app/(app)/challenges/page.tsx": "export default function C(){return null}\n",
    ".claude/workorders/wo-page.md": ownershipOrder("wo-page", "apps/web/app/(app)/challenges/page.tsx"),
  })
  fixWrite("apps/web/app/(app)/challenges/page.tsx", "export default function C(){return 1}\n")
  fixWrite("apps/web/__tests__/app/challenges-page.test.tsx", "export {}\n")
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-page"])
  T("ownership: the <dir>-page test naming shape is a companion too", verdict.status, 0)
}

// ---------------------------------------------------------------------------
// ownership trust root + base resolution. Both shipped broken once: the gate
// read Boundaries off the WORKING-TREE work order - a file the policed child
// must edit (the Timeline append is part of its definition of done) - so one
// inserted line annexed any file in the repo, and the driver's own measurement
// reported a false green. And defaultBase() returned "" when @{upstream} was
// unset, silently dropping the COMMITTED diff, so the gate went vacuously
// green the moment the child obeyed the commit step of its own contract. The
// permitted set now comes from the BASE ref, the work order file is
// append-only against it, and a base that cannot resolve is a loud exit 2.
// ---------------------------------------------------------------------------
const ownershipGit = (fixtureRoot, ...args) => spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" })
const runOwnershipNoBase = (fixtureRoot, args) =>
  spawnSync(process.execPath, [ownershipTool, ...args], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  })

{
  // The measured annexation exploit: a working-tree Boundaries edit must not
  // widen ownership. A mid-file insert is a rewrite, whatever it claims.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("annexrewrite")
  const orderBody = readFileSync(join(fixtureRoot, ".claude", "workorders", "wo-login.md"), "utf8")
  fixWrite(".claude/workorders/wo-login.md", orderBody.replace("## Backlog A", "- `apps/mobile/app/other-styles.ts`\n## Backlog A"))
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 12\n")
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: a Boundaries edit does not widen ownership (rewrite exits 1)", verdict.status, 1)
  T("ownership: ...named as the append-only Timeline contract", /append-only/.test(verdict.stderr), true)
}
{
  // The other annexation door: a grant line APPENDED at EOF survives the
  // append-only check and must still grant nothing - the base list governs.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("annexappend")
  const orderBody = readFileSync(join(fixtureRoot, ".claude", "workorders", "wo-login.md"), "utf8")
  fixWrite(".claude/workorders/wo-login.md", orderBody + "- `apps/mobile/app/other-styles.ts`\n")
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 12\n")
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: an appended grant line grants nothing (base list governs)", verdict.status, 1)
  T("ownership: ...and the annexed file is named as the escape", /other-styles\.ts/.test(verdict.stderr), true)
}
{
  // The one edit the contract orders on the child's own file must stay legal.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("timeline")
  const orderBody = readFileSync(join(fixtureRoot, ".claude", "workorders", "wo-login.md"), "utf8")
  fixWrite(".claude/workorders/wo-login.md", orderBody + "\n## Timeline\n\n- 2026-07-22 cleared one gap\n")
  fixWrite("apps/mobile/app/login-styles.ts", "export const gap = 12\n")
  T("ownership: an append-only Timeline edit passes", runOwnership(fixtureRoot, ["--id", "wo-login"]).status, 0)
}
{
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("truncated")
  fixWrite(".claude/workorders/wo-login.md", ownershipOrder("wo-login", "apps/mobile/app/login-styles.ts").slice(0, 40))
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-login"])
  T("ownership: a truncated work order exits 1", verdict.status, 1)
  T("ownership: ...as a rewrite, not a parse error", /append-only/.test(verdict.stderr), true)
}
{
  // Windows materialises the committed LF orders with CRLF. Normalisation must
  // keep a mere checkout from reading as a rewrite.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("crlf")
  const orderBody = readFileSync(join(fixtureRoot, ".claude", "workorders", "wo-login.md"), "utf8")
  fixWrite(".claude/workorders/wo-login.md", orderBody.replace(/\n/g, "\r\n") + "- 2026-07-22 timeline entry\r\n")
  fixWrite("apps/mobile/app/login-styles.ts", "export const gap = 12\n")
  T("ownership: a CRLF copy of an LF order is not a rewrite", runOwnership(fixtureRoot, ["--id", "wo-login"]).status, 0)
}
{
  // The other CRLF door: the BASE blob itself. A checkout that committed a work
  // order as-is can pin a CRLF copy at the base ref, and the Boundaries reader
  // must parse it identically to its LF twin - or every owned edit reads as an
  // escape.
  const crlfBody = ownershipOrder("wo-login", "apps/mobile/app/login-styles.ts").replace(/\n/g, "\r\n")
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("crlfbase", { ".claude/workorders/wo-login.md": crlfBody })
  fixWrite("apps/mobile/app/login-styles.ts", "export const gap = 12\n")
  T("ownership: a CRLF base blob's Boundaries still grant the owned file", runOwnership(fixtureRoot, ["--id", "wo-login"]).status, 0)
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 12\n")
  T("ownership: ...and still fence an unowned edit (the parse was real)", runOwnership(fixtureRoot, ["--id", "wo-login"]).status, 1)
}
{
  // The committed escape that used to vanish: a fresh branch, no upstream, the
  // escape committed exactly as the definition of done orders. The main
  // merge-base fallback must keep it visible.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("nobase")
  ownershipGit(fixtureRoot, "branch", "-M", "main")
  ownershipGit(fixtureRoot, "checkout", "-q", "-b", "feature/child")
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 12\n")
  ownershipGit(fixtureRoot, "add", "-A")
  ownershipGit(fixtureRoot, "commit", "-qm", "escape")
  const verdict = runOwnershipNoBase(fixtureRoot, ["--id", "wo-login"])
  T("ownership: a committed escape on a no-upstream branch is caught via main", verdict.status, 1)
  T("ownership: ...the escape is named", /other-styles\.ts/.test(verdict.stderr), true)
  T("ownership: ...and the output says how the base resolved", /merge-base with main/.test(verdict.stdout), true)
}
{
  // The post-push shape: an upstream at HEAD is the branch's own copy, whose
  // merge-base proves nothing about committed work. Skip it for the trunk.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("selfupstream")
  ownershipGit(fixtureRoot, "branch", "-M", "main")
  ownershipGit(fixtureRoot, "checkout", "-q", "-b", "feature/child")
  fixWrite("apps/mobile/app/other-styles.ts", "export const pad = 12\n")
  ownershipGit(fixtureRoot, "add", "-A")
  ownershipGit(fixtureRoot, "commit", "-qm", "escape")
  ownershipGit(fixtureRoot, "branch", "pushed-copy")
  ownershipGit(fixtureRoot, "branch", "--set-upstream-to=pushed-copy")
  const verdict = runOwnershipNoBase(fixtureRoot, ["--id", "wo-login"])
  T("ownership: an upstream at HEAD is skipped for the trunk merge-base", verdict.status, 1)
  T("ownership: ...keeping the committed escape visible", /other-styles\.ts/.test(verdict.stderr), true)
}
{
  // No upstream, no origin/main, no main: refuse to guess.
  const { fixtureRoot } = buildOwnershipFixture("norefs")
  ownershipGit(fixtureRoot, "branch", "-M", "trunkless")
  const verdict = runOwnershipNoBase(fixtureRoot, ["--id", "wo-login"])
  T("ownership: no resolvable base is exit 2, never an empty diff", verdict.status, 2)
  T("ownership: ...and the remedy names --base", /--base/.test(verdict.stderr), true)
}
{
  const { fixtureRoot } = buildOwnershipFixture("badbase")
  const verdict = runOwnershipNoBase(fixtureRoot, ["--id", "wo-login", "--base", "no-such-ref-zzz"])
  T("ownership: an unresolvable explicit --base is exit 2", verdict.status, 2)
}
{
  // A work order born mid-run is absent at base and cannot self-grant.
  const { fixtureRoot, fixWrite } = buildOwnershipFixture("midrun")
  fixWrite(".claude/workorders/wo-new.md", ownershipOrder("wo-new", "apps/mobile/app/other-styles.ts"))
  const verdict = runOwnership(fixtureRoot, ["--id", "wo-new"])
  T("ownership: a work order absent at base cannot self-grant (exit 2)", verdict.status, 2)
  T("ownership: ...saying ownership is granted by the base ref", /base ref/.test(verdict.stderr), true)
}

// ---------------------------------------------------------------------------
// drive-queue bundling. Three properties, each verified broken end to end
// before the fix: every bundle shipped `ui: true` (a 2-file packages/shared
// plan bundle was graded against DESIGN.md by the --sleep verifier),
// --only-debt dropped plan work orders entirely (0 lint debt by construction,
// so the documented step-9 commands queued a plan nowhere), and the generated
// prompt ordered edits its own definition-of-done gate then failed (d4). The
// satisfiability block at the end is the d4 pin: every file class the prompt
// ORDERS an edit to must pass the CURRENT check-diff-ownership permitted set
// for that bundle. A future prompt rule that orders a forbidden edit class
// belongs in that block, where it goes red.
// ---------------------------------------------------------------------------
console.log("\n# drive-queue bundling")
const driveQueueTool = join(hooksDir, "..", "..", "tools", "drive-queue.mjs")
const runDriveQueue = (fixtureRoot, args = []) =>
  spawnSync(process.execPath, [driveQueueTool, ...args], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBIT_SURFACE_ROOT: fixtureRoot },
    encoding: "utf8",
  })

// One fixture, the real pipeline: manifest -> workorder.mjs -> drive-queue ->
// prompt -> check-diff-ownership, so a format drift in any link breaks here.
const dqRoot = buildWorkorderFixture("queue", {
  cells: [workorderCell("r-page", "apps/web/app/page.tsx")],
  suppressions: { "app/page.tsx": { "local/spacing-scale": { count: 2 } } },
})
const dqWrite = (rel, body) => {
  const p = join(dqRoot, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}
dqWrite(".gitignore", ".claude/drive/\n")
dqWrite("apps/web/lib/nav.ts", "export const nav = 1\n")
dqWrite("apps/web/lib/menu.ts", "export const menu = 1\n")
dqWrite("packages/shared/src/i18n/en.json", '{"a":"Hi"}\n')
dqWrite("packages/shared/src/i18n/pt-BR.json", '{"a":"Oi"}\n')
dqWrite(".claude/plans/epic-7.plan.md", "# Plan: epic-7\n\n| Field | Value |\n|---|---|\n| Tier | sonnet |\n\n## Files to Change\n\n- EDIT `apps/web/lib/nav.ts`\n")
dqWrite(".claude/plans/epic-8.plan.md", "# Plan: epic-8\n\n## Files to Change\n\n- EDIT `apps/web/lib/menu.ts`\n")
runWorkorder(dqRoot)
runWorkorder(dqRoot, ["--from-plan", ".claude/plans/epic-7.plan.md"])
runWorkorder(dqRoot, ["--from-plan", ".claude/plans/epic-8.plan.md"])
spawnSync("git", ["add", "-A"], { cwd: dqRoot, encoding: "utf8" })
spawnSync("git", ["commit", "-qm", "workorders"], { cwd: dqRoot, encoding: "utf8" })

const dqDry = runDriveQueue(dqRoot, ["--only-debt", "--dry-run"])
T("drive-queue: --only-debt keeps a plan work order despite 0 debt", /plan-epic-7/.test(dqDry.stdout), true)
const dqRun = runDriveQueue(dqRoot, ["--only-debt"])
T("drive-queue: queue written", dqRun.status, 0)
const dqQueue = JSON.parse(readFileSync(join(dqRoot, ".claude", "drive", "queue.json"), "utf8"))
const dqPlanBundle = dqQueue.find((entry) => entry.workOrders.includes("epic-7"))
const dqPlanNoTier = dqQueue.find((entry) => entry.workOrders.includes("epic-8"))
const dqRouteBundle = dqQueue.find((entry) => entry.workOrders.includes("r-page"))
T("drive-queue: a plan bundle is ui:false", dqPlanBundle?.ui, false)
T("drive-queue: a manifest route bundle is ui:true", dqRouteBundle?.ui, true)
T("drive-queue: a plan bundle is solo, never packed with siblings", dqPlanBundle?.workOrders, ["epic-7"])
T("drive-queue: the plan bundle id names the plan", dqPlanBundle?.id, "plan-epic-7")
T("drive-queue: plan tier is read from the plan's Tier field", dqPlanBundle?.tier, "sonnet")
T("drive-queue: a plan with no Tier field falls back to opus", dqPlanNoTier?.tier, "opus")
T("drive-queue: ...and the fallback warning names the plan and the field", /epic-8/.test(dqRun.stderr) && /Tier/.test(dqRun.stderr), true)

const dqRoutePrompt = readFileSync(join(dqRoot, ".claude", "drive", "prompts", `task-${dqRouteBundle.id}.md`), "utf8")
const dqPlanPrompt = readFileSync(join(dqRoot, ".claude", "drive", "prompts", "task-plan-epic-7.md"), "utf8")
// Condition (a) must be per order: the global --check cannot pass while OTHER
// bundles still carry debt, so ordering it makes done unreachable again.
T("drive-queue: condition (a) is the per-order --check --id form", /--check --id 'r-page'/.test(dqRoutePrompt), true)
T("drive-queue: the global --check form stays out of the conditions", /workorder\.mjs --check(?! --id)/.test(dqRoutePrompt), false)
T("drive-queue: rule 3 says the lint:prune ledger rewrite is permitted", /lint:prune/.test(dqRoutePrompt) && /PERMITTED/.test(dqRoutePrompt), true)
T("drive-queue: rule 3 keeps the unedited-file count drop fatal", /never edited/.test(dqRoutePrompt), true)
T("drive-queue: rule 6 names the real test-companion convention", /__tests__/.test(dqRoutePrompt) && /-page\.test\.tsx/.test(dqRoutePrompt), true)
T("drive-queue: a visual prompt forbids editing the mirror platform's files", /mirror/.test(dqRoutePrompt) && /STOP/.test(dqRoutePrompt), true)
T("drive-queue: a visual prompt frames depth as a veto, never a target", /redesign-depth/.test(dqRoutePrompt) && /veto a human consults/.test(dqRoutePrompt), true)
T("drive-queue: a plan prompt does full in-bundle parity instead", /parity\s+is MANDATORY and yours to do IN THIS BUNDLE/.test(dqPlanPrompt), true)
T("drive-queue: a plan prompt carries no depth paragraph or signoff claim", /redesign-depth/.test(dqPlanPrompt) || /signoff\.json/.test(dqPlanPrompt), false)

// THE d4 PIN. Apply every edit class the prompt ORDERS - the owned source, its
// lint:prune ledger rewrite, its conventional test companion, the i18n pair,
// the work order's own Timeline - in ONE diff, then run the real gate with the
// bundle's ids. Obeying the prompt must satisfy the prompt's own gate.
dqWrite("apps/web/app/page.tsx", BASE_TSX.replace('className="p-4 gap-4 rounded-xl border"', 'className="p-8 gap-8 rounded-xl border"'))
dqWrite("apps/web/eslint-suppressions.json", JSON.stringify({ "app/page.tsx": { "local/spacing-scale": { count: 1 } } }))
dqWrite("apps/web/__tests__/app/page.test.tsx", "export {}\n")
dqWrite("packages/shared/src/i18n/en.json", '{"a":"Hi","b":"New"}\n')
dqWrite("packages/shared/src/i18n/pt-BR.json", '{"a":"Oi","b":"Novo"}\n')
const dqOrderPath = join(dqRoot, ".claude", "workorders", "r-page.md")
writeFileSync(dqOrderPath, readFileSync(dqOrderPath, "utf8") + "- 2026-07-22 cleared one spacing violation; left the load-bearing gap alone\n")
const dqVerdict = runOwnership(dqRoot, ["--id", "r-page"])
T("drive-queue: every edit class the prompt orders passes the ownership gate", dqVerdict.status, 0)

// ---------------------------------------------------------------------------
// drive-queue robustness: CRLF checkouts, malformed flags, shell-safe ids.
// Each shipped broken once: a fresh Windows checkout materializes the
// committed orders with CRLF and the LF-only frontmatter regex parsed ZERO of
// them (a loud exit 2 all-CRLF, a silent exit-0 one-bundle queue once a single
// LF plan order joined); `--max-files abc` yielded NaN, every cap comparison
// against NaN is false, and a 33-file bundle sailed past the documented
// 14-file default at exit 0; and the printed DoD command for a route-group id
// (`residual-web-app-(app)-...`) was a bash syntax error exactly as printed.
// ---------------------------------------------------------------------------
console.log("\n# drive-queue robustness (CRLF, flags, id quoting)")
const dqBadCap = runDriveQueue(dqRoot, ["--max-files", "abc", "--dry-run"])
T("drive-queue: --max-files with a non-numeric value exits 2 naming the flag", dqBadCap.status === 2 && /--max-files/.test(dqBadCap.stderr), true)
const dqNoCapValue = runDriveQueue(dqRoot, ["--dry-run", "--max-debt"])
T("drive-queue: a numeric flag missing its value exits 2 naming the flag", dqNoCapValue.status === 2 && /--max-debt/.test(dqNoCapValue.stderr), true)
const dqBadPlatform = runDriveQueue(dqRoot, ["--platform", "ios", "--dry-run"])
T("drive-queue: --platform with an unknown value exits 2 naming the flag", dqBadPlatform.status === 2 && /--platform/.test(dqBadPlatform.stderr), true)
T("drive-queue: --platform missing its value exits 2", runDriveQueue(dqRoot, ["--dry-run", "--platform"]).status, 2)
T("drive-queue: a valid numeric cap still runs", runDriveQueue(dqRoot, ["--max-files", "3", "--dry-run"]).status, 0)

// One fixture whose residual id inherits a Next.js route group - literal
// parentheses in the id, the exact shape that lexed as a shell error unquoted -
// and whose order files then get rewritten CRLF, the way a fresh Windows
// checkout materializes them.
const dqCrlfRoot = buildWorkorderFixture("queue-crlf", {
  cells: [workorderCell("r-page", "apps/web/app/page.tsx")],
  suppressions: { "app/(app)/social/_parts/x-styles.ts": { "local/spacing-scale": { count: 1 } } },
})
runWorkorder(dqCrlfRoot)
const dqCrlfOrders = join(dqCrlfRoot, ".claude", "workorders")
const dqLfDry = runDriveQueue(dqCrlfRoot, ["--dry-run"])
for (const name of readdirSync(dqCrlfOrders).filter((entry) => entry.endsWith(".md"))) {
  const orderPath = join(dqCrlfOrders, name)
  writeFileSync(orderPath, readFileSync(orderPath, "utf8").replace(/\r?\n/g, "\r\n"))
}
const dqCrlfDry = runDriveQueue(dqCrlfRoot, ["--dry-run"])
T("drive-queue: a CRLF checkout still parses every order", dqLfDry.status === 0 && dqCrlfDry.status === 0, true)
T("drive-queue: CRLF orders bundle identically to their LF twins", dqCrlfDry.stdout, dqLfDry.stdout)
const dqCrlfRun = runDriveQueue(dqCrlfRoot)
T("drive-queue: the queue writes from CRLF orders", dqCrlfRun.status, 0)
const parensId = "residual-web-app-(app)-social-_parts"
const dqCrlfQueue = JSON.parse(readFileSync(join(dqCrlfRoot, ".claude", "drive", "queue.json"), "utf8"))
const dqParensBundle = dqCrlfQueue.find((entry) => entry.workOrders.includes(parensId))
T("drive-queue: an id parsed from CRLF frontmatter carries no trailing \\r", !!dqParensBundle, true)

const parensPrompt = readFileSync(join(dqCrlfRoot, ".claude", "drive", "prompts", `task-${dqParensBundle.id}.md`), "utf8")
T("drive-queue: condition (a) single-quotes the route-group id", parensPrompt.includes(`--check --id '${parensId}'`), true)
T("drive-queue: condition (b) single-quotes it too", parensPrompt.includes(`check-diff-ownership.mjs --id '${parensId}'`), true)
// The printed commands must survive a shell's lexer, not just a regex: bash -n
// parses without executing, so a syntax error here is exactly what a child
// pasting its own definition of done would have hit.
const bashLex = (command) => spawnSync("bash", ["-n"], { input: command, encoding: "utf8" }).status
const dodConditionA = (parensPrompt.split("\n").find((line) => line.includes(`--check --id '${parensId}'`)) ?? "").trim()
const dodConditionB = /`(node tools\/check-diff-ownership\.mjs[^`]*)`/.exec(parensPrompt)?.[1] ?? ""
T("drive-queue: the printed condition (a) command lexes in bash", dodConditionA.includes(parensId) && bashLex(dodConditionA) === 0, true)
T("drive-queue: the printed condition (b) command lexes in bash", dodConditionB.includes(parensId) && bashLex(dodConditionB) === 0, true)
T("drive-queue: ...and bash does reject the unquoted form (the control)", bashLex(`node tools/workorder.mjs --check --id ${parensId}`) !== 0, true)

writeFileSync(join(dqCrlfOrders, "junk.md"), "no frontmatter here\n")
const dqJunk = runDriveQueue(dqCrlfRoot, ["--dry-run"])
T("drive-queue: an unparseable order file is named, never silently dropped", dqJunk.status === 0 && /junk\.md/.test(dqJunk.stderr), true)

// ---------------------------------------------------------------------------
// drive engine preflight. A hand-written queue entry with no prompt used to
// sail through --dry-run and then have every bundle recorded "skipped" at
// runtime - a run that does nothing while reporting no failure. The validation
// is exported precisely so it can be pinned here without spawning the engine.
// ---------------------------------------------------------------------------
console.log("\n# drive engine preflight (queue prompts)")
const { queuePromptProblems, buildRunReport } = await import(pathToFileURL(join(hooksDir, "..", "skills", "drive", "run.mjs")).href)
const drivePreflightDir = join(root, "drive-preflight")
mkdirSync(join(drivePreflightDir, "prompts"), { recursive: true })
writeFileSync(join(drivePreflightDir, "prompts", "task-filed.md"), "do the thing\n")
const promptProblems = queuePromptProblems(
  [{ id: "filed" }, { id: "inline", prompt: "an inline prompt" }, { id: "epic-1", label: "hand-written, promptless" }, { id: "blank", prompt: "   " }],
  drivePreflightDir,
)
T("drive: a promptless queue entry is a preflight error naming its id", promptProblems.some((problem) => /"epic-1"/.test(problem)), true)
T("drive: a whitespace-only prompt field is still promptless", promptProblems.some((problem) => /"blank"/.test(problem)), true)
T("drive: a prompt file or an inline prompt both satisfy preflight", promptProblems.length, 2)

// ---------------------------------------------------------------------------
// drive engine: operator-facing honesty. Two shapes shipped broken once: the
// rollup counted ready-for-review inside "completed (done)" - re-conflating the
// two statuses the redesign separated (only a human signoff.json tick grants
// done) - and config.example.json shipped `modelOverride: "sonnet"` permanently
// ON, so the documented copy-the-example step silently forced every opus-tier
// bundle to sonnet with nothing surfacing it.
// ---------------------------------------------------------------------------
console.log("\n# drive engine report + example config")
const reportOutcomes = [
  { id: "b1", label: "route slice", status: "ready-for-review", pr: "https://x/1", elapsedMs: 60000 },
  { id: "b2", label: "blocked slice", status: "blocked", elapsedMs: 60000 },
  { id: "b3", label: "signed cell", status: "done", verdict: "DISAGREE", elapsedMs: 60000 },
]
const report = buildRunReport(reportOutcomes, 4, 1)
T("drive report: ready-for-review is its own count", /- ready for review: 1\b/.test(report.summary), true)
T("drive report: done stays reserved for the human-granted state", /- done \(human-granted\): 1\b/.test(report.summary), true)
T("drive report: nothing is labelled 'completed (done)' anymore", /completed \(done\)/.test(report.summary), false)
T("drive report: the headline splits the counts the same way", /1\/4 ready for review/.test(report.headline) && /1 done \(human-granted\)/.test(report.headline), true)
T("drive report: the per-task table still shows the literal machine status", /\| b1 \| route slice \| ready-for-review \|/.test(report.summary), true)

const exampleConfig = JSON.parse(readFileSync(join(hooksDir, "..", "skills", "drive", "config.example.json"), "utf8"))
T("drive config: the example ships no modelOverride (tier routing on by default)", "modelOverride" in exampleConfig, false)

// ---------------------------------------------------------------------------
// drive engine preflight, spawned for real. Round 1 observed a PREFLIGHT
// FAILED run exit 0 (success to any caller checking the code), and SKILL.md
// promised a base-branch check the engine never had: launched from a feature
// branch with base "main", the first reset would check out a base carrying
// none of the queue's work orders or gate tools. The `claude`-CLI probe may
// legitimately fail here too (CI has no claude on PATH); that only ADDS a
// preflight problem, so the nonzero-exit and message assertions below hold
// with or without it.
// ---------------------------------------------------------------------------
console.log("\n# drive engine preflight (spawned)")
const driveEngine = join(hooksDir, "..", "skills", "drive", "run.mjs")
function buildDriveEngineFixture(name, { branch = "main", promptless = false } = {}) {
  const repoDir = join(root, `drive-repo-${name}`)
  mkdirSync(repoDir, { recursive: true })
  writeFileSync(join(repoDir, "README.md"), "fixture\n")
  const git = (...args) => spawnSync("git", args, { cwd: repoDir, encoding: "utf8" })
  git("init", "-q")
  git("config", "user.email", "t@example.com")
  git("config", "user.name", "t")
  git("add", "-A")
  git("commit", "-qm", "baseline")
  git("branch", "-M", "main")
  if (branch !== "main") git("checkout", "-q", "-b", branch)
  const engineDir = join(root, `drive-engine-${name}`)
  mkdirSync(join(engineDir, "prompts"), { recursive: true })
  // push:false keeps preflight off `gh`; --dry-run never reaches the lock or a spawn.
  writeFileSync(join(engineDir, "config.json"), JSON.stringify({ push: false, repos: [{ path: repoDir, base: "main" }] }))
  const task = promptless ? { id: "b1", label: "no prompt" } : { id: "b1", label: "with prompt", prompt: "do the thing" }
  writeFileSync(join(engineDir, "queue.json"), JSON.stringify([task]))
  return engineDir
}
const runDriveEngine = (engineDir) => spawnSync(process.execPath, [driveEngine, "--dry-run", "--dir", engineDir], { encoding: "utf8" })

const enginePromptless = runDriveEngine(buildDriveEngineFixture("promptless", { promptless: true }))
T("drive engine: a failed preflight exits nonzero, never 0", enginePromptless.status !== 0, true)
T("drive engine: ...printing PREFLIGHT FAILED and naming the promptless entry", /PREFLIGHT FAILED/.test(enginePromptless.stdout) && /"b1"/.test(enginePromptless.stdout), true)

const engineBranch = runDriveEngine(buildDriveEngineFixture("offbase", { branch: "feature/child" }))
T("drive engine: a repo off its configured base fails preflight nonzero", engineBranch.status !== 0, true)
T("drive engine: ...naming the actual and the configured branch", /"feature\/child"/.test(engineBranch.stdout) && /base is "main"/.test(engineBranch.stdout), true)

// The startup line prints before preflight, so this holds even where preflight
// then fails on a missing claude CLI.
T("drive engine: a dry run announces itself as a dry run, never --sleep", /drive \(dry run\) starting/.test(runDriveEngine(buildDriveEngineFixture("mode")).stdout), true)
T("drive engine: no dry run is mislabelled as --sleep", /drive --sleep starting/.test(engineBranch.stdout), false)

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
T("oc before: touch PAUSED throws", await before("bash", { command: "touch .claude/manifests/PAUSED" }), true)
T("oc before: write verdicts throws", await before("write", { filePath: "/x/.artifacts/surfaces/verdicts.json", content: "{}" }), true)
T("oc before: cat manifest allows", await before("bash", { command: "cat .claude/manifests/surfaces.json" }), false)
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
    const entries = frontmatterToolEntries(readFileSync(join(dir, file), "utf8"))
    T(`agents: ${file} declares no fails-open parenthesized specifier`, entries.filter(failsOpen), [])
    // A bare `Agent` grant on an IMPLEMENTER lets it spawn itself, unbounded, and
    // both implement tiers carried one while their own bodies claimed the tool was
    // "granted only for these three read-only checkers". Prose is not a grant.
    // Flagged High on PR #560. `Agent(<type>)` is the form that actually scopes.
    if (/^implement-/.test(file)) {
      T(`agents: ${file} scopes Agent to named types, not bare`, entries.filter((entry) => /^Agent$/.test(entry)), [])
    }
  }
}
// A guard that scanned nothing passes vacuously; make that a failure instead.
T("agents: the guard actually scanned agent files", agentsScanned > 0, true)

// Cleanup is housekeeping, never a verification signal: it lives in the exit
// handler registered at the fixture root's creation (best-effort, error-swallowed),
// so it runs even on a mid-suite crash and can never veto the verdict below.
console.log(`\n${fails === 0 ? "ORBIT HOOK PARITY OK" : `ORBIT HOOK PARITY FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
