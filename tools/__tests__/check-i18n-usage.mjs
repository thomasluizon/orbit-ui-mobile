import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { check, root } from "./_harness.mjs"

const catalog = { common: { save: "Save" }, habits: { hideCompleted: "Hide completed" } }
const catalogPath = (locale) => `packages/shared/src/i18n/${locale}.json`
function repository(label, files, en = catalog, pt = en) {
  const directory = join(root, "i18n-usage", label)
  for (const [path, content] of Object.entries({
    [catalogPath("en")]: JSON.stringify(en),
    [catalogPath("pt-BR")]: JSON.stringify(pt),
    ...files,
  })) {
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    writeFileSync(join(directory, path), content)
  }
  return directory
}

export function cases() {
  const clean = repository("clean", {
    "apps/web/page.tsx": `import { useTranslations as useWords } from 'next-intl'
const namespace = 'habits' as const
function Habit() { const words = useWords(namespace); return words('hideCompleted') }
function Save() { const t = useWords('common'); return t("save") }
function Root() { const t = useWords(); const alias = t; return alias('common.save') }
// t('missing.comment')
const prose = "t('missing.string')"
`,
    "apps/web/layout.ts": `import { getTranslations } from 'next-intl/server'
async function metadata() { const t = await getTranslations({locale: 'en', namespace: 'common'}); return t('save') }
async function title() { const t = await getTranslations('common'); return t('save') }`,
    "apps/mobile/screen.tsx": `import { useTranslation as useWords } from 'react-i18next'
function Screen() { const { t: words } = useWords(); return words('habits.hideCompleted') }
function Prefix() { const {t} = useWords('translation', {keyPrefix: 'common'}); return t('save') }
i18n.t('common.save')`,
    "packages/shared/src/labels.ts": "t('common.save')",
  })
  check("check-i18n-usage.mjs", "parses both libraries, lexical scopes, aliases, constants and server namespaces",
    ["--root", clean], { status: 0, stdout: /9 resolved calls/ }, { cwd: root })

  for (const [platform, hook, key] of [
    ["web", "const t = useTranslations('common')", "save"],
    ["mobile", "const { t } = useTranslation()", "common.save"],
  ]) {
    const forwarded = repository(`forwarded-${platform}`, {
      [`apps/${platform}/screen.tsx`]: `function Screen() {
  ${hook}; const shared = { t }; return <Child {...shared} />
}
function Child(props) { const { t: words } = props; return label(words) + <Grandchild t={words} /> }
function Grandchild({t}) { return t('${key}') }
function label(t) { return t('${key}') }`,
    })
    check("check-i18n-usage.mjs", `traces ${platform} translators through helpers, prop aliases and JSX spreads`,
      ["--root", forwarded], { status: 0, stdout: /Unresolved translation calls: 0 in 0 files[\s\S]*2 resolved calls/ })
    const missingForwarded = repository(`missing-forwarded-${platform}`, {
      [`apps/${platform}/screen.tsx`]: `function Screen() { ${hook}; return <Child t={t} /> }
function Child({t}) { return label(t) }
function label(t) { return t('missing') }`,
    })
    check("check-i18n-usage.mjs", `rejects missing ${platform} keys behind forwarded translators`,
      ["--root", missingForwarded], { status: 1, stderr: /screen.tsx:3: missing (common\.)?missing/ })
  }

  for (const [label, source] of [
    ["different-namespaces", "function Screen(){ const a = useTranslations('common'); const b = useTranslations('habits'); return label(a) + label(b) }"],
    ["unknown-caller", "function Screen(){ const t = useTranslations('common'); return label(t) + label(unknown) }"],
    ["escaped-helper", "function Screen(){ const t = useTranslations('common'); consume(label); return label(t) }"],
    ["escaped-object", "function Screen(){ const t = useTranslations('common'); consume({label}); return label(t) }"],
    ["exported-helper", "export {label}; function Screen(){ const t = useTranslations('common'); return label(t) }"],
  ]) {
    const directory = repository(label, { "apps/web/page.tsx": `${source}\nfunction label(t){ return t('save') }` })
    check("check-i18n-usage.mjs", `keeps ${label} visible instead of guessing a namespace`, ["--root", directory],
      { status: 0, stdout: /Unresolved translator bindings: 1; 1 with literal keys/ })
  }
  const overridden = repository("overridden-prop", { "apps/web/page.tsx": `function Screen(){
const t = useTranslations('common'); const shared = { t }; return <Child {...shared} t={useTranslations('habits')} />
}
function Child({t}) { return t('save') }` })
  check("check-i18n-usage.mjs", "uses the last JSX prop assignment when it overrides a spread", ["--root", overridden],
    { status: 1, stderr: /missing habits.save/ })
  const cyclic = repository("cyclic-props", { "apps/web/page.tsx": `function Screen(){ const props = props; return <Child {...props} /> }
function Child({t}) { return t('save') }` })
  check("check-i18n-usage.mjs", "reports cyclic prop bindings without recursing forever", ["--root", cyclic],
    { status: 0, stdout: /Unresolved translator bindings: 1; 1 with literal keys/ })
  const reassigned = repository("reassigned-parameter", { "apps/web/page.tsx": `function Screen(){ const t = useTranslations('common'); return label(t) }
function label(t) { t = useTranslations('habits'); return t('save') }` })
  check("check-i18n-usage.mjs", "does not infer a reassigned parameter from its incoming argument", ["--root", reassigned],
    { status: 0, stdout: /Unresolved translator bindings: 1; 1 with literal keys/ })

  for (const [label, source, key] of [
    ["root", "const t = useTranslations();\nt('missing.key')", "missing.key"],
    ["namespace", "const t = useTranslations('habits');\nt('missing')", "habits.missing"],
    ["mobile", "const {t} = useTranslation();\nt('missing.key')", "missing.key"],
    ["instance", "const unused = 1;\ni18n.t('missing.key')", "missing.key"],
    ["rich", "const t = useTranslations('common');\nt.rich('missing')", "common.missing"],
    ["scope", "function First(){ const t = useTranslations('habits'); return t('hideCompleted') }\nfunction Second(){ const t = useTranslations('common'); return t('hideCompleted') }", "common.hideCompleted"],
  ]) {
    const directory = repository(label, { "apps/web/page.tsx": source })
    check("check-i18n-usage.mjs", `rejects missing ${label} key with source location`, ["--root", directory],
      { status: 1, stderr: new RegExp(`apps/web/page.tsx:2: missing ${key} in en.json, pt-BR.json`) })
  }

  const oneLocale = repository("one-locale", { "apps/web/page.tsx": "t('onlyEnglish')" },
    { ...catalog, onlyEnglish: "English" }, catalog)
  check("check-i18n-usage.mjs", "checks usage in both locales, independently of parity", ["--root", oneLocale],
    { status: 1, stderr: /apps\/web\/page.tsx:1: missing onlyEnglish in pt-BR.json/ })
  const parity = repository("parity", {}, catalog, { common: { save: "Save" } })
  check("check-i18n-usage.mjs", "rejects unused asymmetric catalog keys too", ["--root", parity],
    { status: 1, stderr: /pt-BR.json:1: catalog parity missing habits.hideCompleted/ })
  const object = repository("object", { "apps/web/page.tsx": "t('habits')" })
  check("check-i18n-usage.mjs", "objects do not satisfy message lookups", ["--root", object], { status: 1 })

  const dynamic = repository("dynamic", {
    "apps/web/page.tsx": "const t = useTranslations(namespace); t('save'); t(`common.save`); t(`common.${key}`); t(keys[index])",
    "apps/mobile/screen.tsx": "const {t} = useTranslation(); t(key)",
  })
  check("check-i18n-usage.mjs", "prints unresolved counts and every affected file without failing", ["--root", dynamic],
    { status: 0, stdout: /Unresolved translation calls: 5 in 2 files\s+apps\/mobile\/screen.tsx: 1\s+apps\/web\/page.tsx: 4/ })
  const passed = repository("passed", { "apps/web/page.tsx": "function label(t: (key: string) => string) { return t('save') }" })
  check("check-i18n-usage.mjs", "reports an unproven parameter namespace instead of guessing root", ["--root", passed],
    { status: 0, stdout: /Unresolved translation calls: 1 in 1 files[\s\S]*Unresolved translator bindings: 1; 1 with literal keys/ })
  const malformed = repository("malformed", { "apps/web/page.tsx": "const t = useTranslations(;" })
  check("check-i18n-usage.mjs", "refuses malformed source", ["--root", malformed], { status: 2 })
  check("check-i18n-usage.mjs", "refuses a missing root value", ["--root"], { status: 2 })

  const indexed = repository("index", { "apps/web/page.tsx": "t('common.save')" })
  const git = (args) => execFileSync("git", args, { cwd: indexed, encoding: "utf8" })
  git(["init", "--quiet"])
  git(["--literal-pathspecs", "add", catalogPath("en"), catalogPath("pt-BR"), "apps/web/page.tsx"])
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"])
  writeFileSync(join(indexed, "apps/web/page.tsx"), "t('missing.staged')")
  git(["--literal-pathspecs", "add", "apps/web/page.tsx"])
  writeFileSync(join(indexed, "apps/web/page.tsx"), "t('common.save')")
  check("check-i18n-usage.mjs", "unstaged source repairs cannot hide staged misses", ["--root", indexed, "--staged"],
    { status: 1, stderr: /missing missing.staged/ })
  git(["--literal-pathspecs", "add", "apps/web/page.tsx"])
  writeFileSync(join(indexed, "apps/web/unstaged.tsx"), "t('missing.unstaged')")
  check("check-i18n-usage.mjs", "empty staged source set ignores unrelated working files", ["--root", indexed, "--staged"],
    { status: 0, stdout: /0 resolved calls in 0 files/ })
  for (const locale of ["en", "pt-BR"]) writeFileSync(join(indexed, catalogPath(locale)), JSON.stringify({ habits: catalog.habits }))
  git(["--literal-pathspecs", "add", catalogPath("en"), catalogPath("pt-BR")])
  for (const locale of ["en", "pt-BR"]) writeFileSync(join(indexed, catalogPath(locale)), JSON.stringify(catalog))
  check("check-i18n-usage.mjs", "catalog-only staged removals scan all indexed callers using indexed catalogs",
    ["--root", indexed, "--staged"], { status: 1, stderr: /apps\/web\/page.tsx:1: missing common.save in en.json, pt-BR.json/ })
}
