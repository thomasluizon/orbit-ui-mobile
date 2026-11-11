import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

import { T, REPO_ROOT, root, stage, run } from './_harness.mjs'
import { scan, compare, validateRules, newLosses } from '../check-feature-parity.mjs'
import { generatedInventory, manifestPath } from './_feature-parity-tree.mjs'

// The full-tree web and Android cases live in check-feature-parity-web.mjs and check-feature-parity-mobile.mjs.

function inventoryRegressions(fixture) {
  const { directory, put, git, generate, source, provenance } = fixture
  const controls = 'packages/shared/src/parity-controls.tsx'
  const manifest = () => JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
  const secondLine = () => manifest().entries.find((entry) => entry.id === 'web:control:common.all').redesign[0].line
  const originalLine = secondLine()
  const base = git(['rev-parse', 'HEAD'])
  for (const branch of ['shift-first', 'shift-second']) {
    git(['checkout', '-q', '-b', branch, base])
    const shift = branch === 'shift-first' ? 1 : 2
    put(controls, branch === 'shift-first' ? `\n${source}` : source.replace('export function Second', '\n\nexport function Second'))
    const generated = generate(['--ci', '--base', base])
    T(`${branch} regenerates evidence from shifted source`, generated.status === 0 && secondLine() === originalLine + shift, generated.stderr)
    git(['add', controls])
    if (git(['ls-files', manifestPath])) git(['add', manifestPath])
    git(['commit', '-q', '-m', `Shift inventoried source on ${branch}`])
  }
  const merged = spawnSync('git', ['merge-tree', '--write-tree', 'shift-first', 'shift-second'], { cwd: directory, encoding: 'utf8' })
  T('independent source line shifts merge without generated evidence conflicts', merged.status === 0, merged.stdout + merged.stderr)
  const ignored = spawnSync('git', ['check-ignore', manifestPath], { cwd: directory, encoding: 'utf8' })
  T('regenerated evidence stays ignored', ignored.status === 0 && ignored.stdout.trim() === manifestPath)
  put(manifestPath, 'invalid stale inventory')
  put(controls, source.replace("<button onClick={open}>{t('habits.viewAll')}</button>", '<span />'))
  const loss = generate(['--ci', '--base', base])
  T('the CLI rejects a new loss despite a stale local manifest', loss.status === 1 && /web:control:habits.viewAll \| packages\/shared\/src\/parity-controls.tsx:1/.test(loss.stdout), loss.stdout + loss.stderr)
  put('tools/feature-parity-rules.json', JSON.stringify({ provenance, tickets: { 'web:control:habits.viewAll': '#1423', 'mobile:control:habits.viewAll': '#1423' } }))
  T('a restoration ticket cannot exempt a new source loss', generate(['--ci', '--base', base]).status === 1)
  git(['add', controls, 'tools/feature-parity-rules.json'])
  git(['commit', '-q', '-m', 'Ticketed source debt fixture'])
  T('ticketed base losses remain advisory without a committed manifest', generate(['--ci', '--base', 'HEAD']).status === 0)
  put('tools/feature-parity-rules.json', JSON.stringify({ provenance }))
  T('an unticketed base loss still blocks', generate(['--ci', '--base', 'HEAD']).status === 1)
  put(controls, source)
  rmSync(join(directory, '.claude/manifests'), { recursive: true })
  const fresh = generate(['--ci', '--base', base])
  T('writing the inventory creates its output directory', fresh.status === 0, fresh.stderr)
}


function promotionFixture(catalog) {
  const directory = join(root, 'parity-promotion')
  const put = (path, source) => stage(`parity-promotion/${path}`, source)
  const git = (args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  put('packages/shared/src/i18n/en.json', catalog)
  const route = 'apps/web/app/page.tsx'
  const legacy = "export default function Home() { return <button onClick={open}>{t('habits.viewAll')}</button> }"
  const current = "export default function Home() { return <><button onClick={open}>{t('common.all')}</button><button onClick={open}>{t('chat.attachFile')}</button></> }"
  put(route, legacy)
  put('tools/feature-parity-rules.json', '{}')
  put('DESIGN.md', 'Verified removal permission')
  git(['init', '-q', '--initial-branch=main'])
  git(['config', 'user.email', 'gate@orbit.test'])
  git(['config', 'user.name', 'Orbit Gate'])
  git(['add', route, 'packages/shared/src/i18n/en.json', 'tools/feature-parity-rules.json', 'DESIGN.md'])
  git(['commit', '-q', '-m', 'Legacy production source'])
  const legacyRevision = git(['rev-parse', 'HEAD'])
  const rules = {
    provenance: { legacyProduction: legacyRevision },
    mappings: { 'web:control:habits.viewAll': { targets: ['web:control:common.all'], reason: 'Relocated control' } },
    tickets: { 'web:control:habits.viewAll': '#1423' },
  }
  put(route, current)
  put('tools/feature-parity-rules.json', JSON.stringify(rules))
  git(['add', route, 'tools/feature-parity-rules.json'])
  git(['commit', '-q', '-m', 'Promoted production with a new control'])
  const promoted = git(['rev-parse', 'HEAD'])
  const check = (production = promoted, base = promoted) => run('check-feature-parity.mjs', ['--root', directory, '--production', production, '--base', base, '--ci', '--write'])
  return { directory, put, git, route, legacy, current, legacyRevision, promoted, rules, check }
}

function provenanceRegressions(catalog) {
  for (const section of ['legacyProduction', 'productionSnapshots']) {
    const directory = join(root, `parity-provenance-${section}`)
    const put = (path, source) => stage(`parity-provenance-${section}/${path}`, source)
    const git = (args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
    const route = 'apps/web/app/page.tsx'
    const rulesPath = 'tools/feature-parity-rules.json'
    const control = "export default function Home() { return <button onClick={open}>{t('common.save')}</button> }"
    const rendered = "export default function Home() { return <p>{t('common.all')}</p> }"
    put('packages/shared/src/i18n/en.json', catalog)
    put(route, section === 'legacyProduction' ? control : 'export default function Home() { return null }')
    put(rulesPath, '{}')
    git(['init', '-q', '--initial-branch=main'])
    git(['config', 'user.email', 'gate@orbit.test'])
    git(['config', 'user.name', 'Orbit Gate'])
    git(['add', route, rulesPath, 'packages/shared/src/i18n/en.json'])
    git(['commit', '-q', '-m', 'Legacy provenance source'])
    const legacyProduction = git(['rev-parse', 'HEAD'])
    put(route, control)
    git(['add', route])
    git(['commit', '-q', '--allow-empty', '-m', 'Production control source'])
    const snapshot = git(['rev-parse', 'HEAD'])
    const provenance = { legacyProduction, ...(section === 'productionSnapshots' ? { productionSnapshots: [snapshot] } : {}) }
    const rules = { provenance, mappings: { 'web:control:common.save': { targets: ['web:content:common.all'], reason: 'Relocated to rendered content' } } }
    put(route, rendered)
    put(rulesPath, JSON.stringify(rules))
    git(['add', route, rulesPath])
    git(['commit', '-q', '-m', 'Retain the relocated production control'])
    const base = git(['rev-parse', 'HEAD'])
    const check = () => run('check-feature-parity.mjs', ['--root', directory, '--production', base, '--base', base, '--ci'])
    const valid = check()
    T(`${section} retains a valid inherited relocation in CI`, valid.status === 0, valid.stdout + valid.stderr)
    put(rulesPath, JSON.stringify({ ...rules, provenance: { ...provenance, productionSnapshots: [base, ...(provenance.productionSnapshots ?? [])] } }))
    const extended = check()
    T(`${section} permits extending retained production snapshots in CI`, extended.status === 0, extended.stdout + extended.stderr)
    put(rulesPath, JSON.stringify(rules))
    put(route, 'export default function Home() { return null }')
    const deletion = check()
    T(`${section} rejects a deleted relocation target with unchanged provenance`, deletion.status === 1 && deletion.stdout.includes('web:control:common.save |'), deletion.stdout + deletion.stderr)
    const changed = section === 'legacyProduction' ? { legacyProduction: base } : { legacyProduction }
    put(rulesPath, JSON.stringify({ ...rules, provenance: changed }))
    const bypass = check()
    T(`${section} rejects candidate provenance shrinkage before stale rules become advisory`, bypass.status === 2 && bypass.stderr.includes(`provenance.${section}`) && bypass.stderr.includes(section === 'legacyProduction' ? legacyProduction : snapshot) && !bypass.stdout.includes('advisory'), `exit ${bypass.status}\n${bypass.stdout}${bypass.stderr}`)
  }
}

function promotionRegressions(catalog) {
  const fixture = promotionFixture(catalog)
  const { directory, put, git, route, legacy, current, legacyRevision, promoted, rules, check } = fixture
  const beforePromotion = check(legacyRevision)
  T('legacy production and its verified rules reach a complete comparison', beforePromotion.status === 0, beforePromotion.stderr)
  const afterPromotion = check()
  T('promoted production preserves legacy rules and current capabilities', afterPromotion.status === 0, afterPromotion.stderr)
  if (afterPromotion.status === 0) {
    const inventory = JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
    T('the union deduplicates routes and records both immutable source revisions and base', inventory.entries.length === 4 && inventory.production === promoted && inventory.legacyProduction === legacyRevision && inventory.base === promoted)
    T('legacy relocation and the postlegacy control both have evidence', ['web:control:habits.viewAll', 'web:control:chat.attachFile'].every((id) => inventory.entries.some((entry) => entry.id === id && entry.disposition === 'retained' && entry.redesign.length > 0)))
  }
  put(route, current.replace("<button onClick={open}>{t('chat.attachFile')}</button>", ''))
  const currentLoss = check()
  T('a control shipped after the legacy snapshot remains blocking', currentLoss.status === 1 && currentLoss.stdout.includes('web:control:chat.attachFile |'), currentLoss.stdout + currentLoss.stderr)
  put(route, current.replace("<button onClick={open}>{t('common.all')}</button>", ''))
  const relocationLoss = check()
  T('a ticket cannot exempt a newly lost legacy relocation target', relocationLoss.status === 1 && relocationLoss.stdout.includes('web:control:habits.viewAll |'), relocationLoss.stdout + relocationLoss.stderr)
  git(['add', route])
  git(['commit', '-q', '-m', 'Existing ticketed relocation gap'])
  T('existing ticketed debt remains advisory with legacy production', check(legacyRevision, 'HEAD').status === 0)
  put('tools/feature-parity-rules.json', JSON.stringify({ ...rules, tickets: {} }))
  T('existing unticketed legacy debt blocks', check(legacyRevision, 'HEAD').status === 1)
  put('tools/feature-parity-rules.json', JSON.stringify(rules))
  put(route, current)
  git(['add', route])
  git(['commit', '-q', '-m', 'Restore the relocated control'])
  const restoredBase = git(['rev-parse', 'HEAD'])
  put(route, current.replace("<button onClick={open}>{t('common.all')}</button>", ''))
  T('a restored then lost legacy capability blocks despite its ticket', check(legacyRevision, restoredBase).status === 1)
  put(route, legacy)
  T('restoring the original legacy control satisfies its relocation', check(legacyRevision, restoredBase).status === 0)
  put(route, current)
  postlegacyRelocation(fixture)
  invalidPromotionInputs(fixture)
  staleRuleRegressions(fixture)
}

function staleRuleRegressions({ directory, put, git, route, current, rules, check }) {
  const id = 'web:control:common.save'
  put(route, current.replace("t('chat.attachFile')", "t('common.save')"))
  git(['add', route, 'tools/feature-parity-rules.json'])
  git(['commit', '-q', '-m', 'Ship a postlegacy control'])
  const production = git(['rev-parse', 'HEAD'])
  const variants = {
    mappings: { targets: ['web:control:common.all'], reason: 'Relocated control' },
    removals: { citation: 'DESIGN.md', rule: 'Verified removal permission', reason: 'Removed control' },
    tickets: '#1423',
  }
  for (const [section, rule] of Object.entries(variants)) {
    put(route, current)
    put('tools/feature-parity-rules.json', JSON.stringify(rules))
    git(['add', route, 'tools/feature-parity-rules.json'])
    git(['commit', '-q', '--allow-empty', '-m', 'Retire the postlegacy control'])
    const cleanBase = git(['rev-parse', 'HEAD'])
    const candidate = { ...rules, [section]: { ...rules[section], [id]: rule } }
    put('tools/feature-parity-rules.json', JSON.stringify(candidate))
    const unknown = check(cleanBase, cleanBase)
    T(`${section} rejects a newly added unknown capability`, unknown.status === 2 && unknown.stderr.includes(`${section}: no production capability ${id}`), unknown.stdout + unknown.stderr)
    git(['add', 'tools/feature-parity-rules.json'])
    git(['commit', '-q', '-m', 'Inherit the postlegacy rule'])
    const base = git(['rev-parse', 'HEAD'])
    const valid = check(production, base)
    T(`${section} accepts a rule backed by production source`, valid.status === 0, valid.stdout + valid.stderr)
    const inherited = check(base, base)
    T(`${section} reports the inherited stale capability as advisory with its exact retirement ID`, inherited.status === 0 && inherited.stdout.includes(`${section}: ${id}`) && /advisory.*retire/i.test(inherited.stdout), inherited.stdout + inherited.stderr)
    const strict = run('check-feature-parity.mjs', ['--root', directory, '--production', base])
    T(`${section} still reports stale keys outside CI`, strict.status === 2 && strict.stderr.includes(`${section}: no production capability ${id}`), strict.stdout + strict.stderr)
    const otherSection = section === 'tickets' ? 'mappings' : 'tickets'
    put('tools/feature-parity-rules.json', JSON.stringify({ ...rules, [otherSection]: { ...rules[otherSection], [id]: variants[otherSection] } }))
    const moved = check(base, base)
    T(`${section} cannot exempt an unknown key added to another rule section`, moved.status === 2 && moved.stderr.includes(`${otherSection}: no production capability ${id}`), moved.stdout + moved.stderr)
  }
}

function postlegacyRelocation({ directory, put, git, route, current, promoted, rules, check }) {
  const relocated = current.replace("t('chat.attachFile')", "t('common.save')")
  const retainedRules = {
    ...rules,
    provenance: { ...rules.provenance, productionSnapshots: [promoted] },
    mappings: { ...rules.mappings, 'web:control:chat.attachFile': { targets: ['web:control:common.save'], reason: 'Relocated postlegacy control' } },
  }
  put(route, relocated)
  put('tools/feature-parity-rules.json', JSON.stringify(retainedRules))
  git(['add', route, 'tools/feature-parity-rules.json'])
  git(['commit', '-q', '-m', 'Promote a relocated postlegacy control'])
  const relocatedProduction = git(['rev-parse', 'HEAD'])
  const retained = check(relocatedProduction, relocatedProduction)
  T('a postlegacy relocation keeps its source obligation after production promotion', retained.status === 0, retained.stdout + retained.stderr)
  if (retained.status === 0) {
    const inventory = JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
    T('the inventory records immutable intermediate production evidence', inventory.productionSnapshots?.[0] === promoted && inventory.entries.some(entry => entry.id === 'web:control:chat.attachFile' && entry.disposition === 'retained'))
  }
  put(route, relocated.replace("<button onClick={open}>{t('common.save')}</button>", ''))
  const lost = check(relocatedProduction, relocatedProduction)
  T('losing a promoted postlegacy relocation target remains blocking', lost.status === 1 && lost.stdout.includes('web:control:chat.attachFile |'), lost.stdout + lost.stderr)
  for (const snapshots of [['main'], ['f'.repeat(40)], [git(['rev-parse', `${promoted}^{tree}`])], promoted, null]) {
    put('tools/feature-parity-rules.json', JSON.stringify({ ...retainedRules, provenance: { ...rules.provenance, productionSnapshots: snapshots } }))
    T('intermediate production evidence rejects mutable, missing, noncommit and malformed snapshots', check(relocatedProduction, relocatedProduction).status === 2)
  }
  put(route, current)
  put('tools/feature-parity-rules.json', JSON.stringify(rules))
}

function invalidPromotionInputs({ directory, put, git, check, rules, legacyRevision, promoted }) {
  const invalidRules = [
    ['missing provenance', { ...rules, provenance: undefined }, /provenance/],
    ['unknown provenance field', { ...rules, provenance: { ...rules.provenance, ignored: legacyRevision } }, /provenance/],
    ['floating legacy reference', { ...rules, provenance: { legacyProduction: 'main' } }, /immutable/],
    ['missing legacy object', { ...rules, provenance: { legacyProduction: 'f'.repeat(40) } }, /./],
    ['noncommit legacy object', { ...rules, provenance: { legacyProduction: git(['rev-parse', `${legacyRevision}^{tree}`]) } }, /./],
    ['unknown source ID', { ...rules, tickets: { 'web:control:invented': '#1423' } }, /no production capability/],
    ['cross-platform mapping', { ...rules, mappings: { 'web:control:habits.viewAll': { reason: 'Moved', targets: ['mobile:control:common.all'] } } }, /same platform/],
    ['invalid mapping kind', { ...rules, mappings: { 'web:control:habits.viewAll': { reason: 'Moved', targets: ['web:invented:common.all'] } } }, /mapping targets/],
    ['empty mapping', { ...rules, mappings: { 'web:control:habits.viewAll': { reason: 'Moved', targets: [] } } }, /mapping targets/],
    ['unverifiable removal citation', { ...rules, mappings: {}, tickets: {}, removals: { 'web:control:habits.viewAll': { reason: 'Removed', citation: 'DESIGN.md', rule: 'Invented permission' } } }, /citation/],
    ['invalid ticket', { ...rules, tickets: { 'web:control:habits.viewAll': 'done' } }, /ticket reference/],
  ]
  for (const [name, variant, message] of invalidRules) {
    put('tools/feature-parity-rules.json', JSON.stringify(variant))
    const result = check()
    T(`${name} is rejected before comparison`, result.status === 2 && message.test(result.stderr), result.stdout + result.stderr)
  }
  put('tools/feature-parity-rules.json', JSON.stringify({ ...rules, provenance: { legacyProduction: promoted } }))
  const wrongEra = run('check-feature-parity.mjs', ['--root', directory, '--production', promoted])
  T('wrong era provenance reports stale legacy rules outside CI', wrongEra.status === 2 && /no production capability/.test(wrongEra.stderr), wrongEra.stdout + wrongEra.stderr)
  const wrongEraCi = check()
  T('wrong era provenance is rejected in CI', wrongEraCi.status === 2 && /provenance.legacyProduction/.test(wrongEraCi.stderr), `exit ${wrongEraCi.status}\n${wrongEraCi.stdout}${wrongEraCi.stderr}`)
  put('tools/feature-parity-rules.json', JSON.stringify(rules))
  T('an invalid active production reference fails closed', check('missing-production').status === 2)
  T('an invalid queued base fails closed', check(legacyRevision, 'missing-base').status === 2)
}


function mappedOwnerRegressions(catalog) {
  for (const platform of ['web', 'mobile']) {
    const owner = `apps/${platform}/components/generator.tsx`
    const sibling = `apps/${platform}/components/date.tsx`
    const route = `apps/${platform}/app/${platform === 'web' ? 'page' : 'index'}.tsx`
    const files = {
      'packages/shared/src/i18n/en.json': catalog,
      [route]: "import { Generator } from '../components/generator'; import { DateAction } from '../components/date'; export default function Home() { return <><Generator /><DateAction /></> }",
      [owner]: "export function Generator() { return <button onClick={suggest}>{t('habits.form.suggestDate')}</button> }",
      [sibling]: "export function DateAction() { return <button onClick={askDate}>{t('habits.form.suggestDate')}</button> }",
    }
    const current = { paths: new Set(Object.keys(files)), read: (path) => {
      if (!(path in files)) throw new Error(`missing source: ${path}`)
      return files[path]
    } }
    const id = `${platform}:control:habits.form.suggestTags`
    const capability = [{ id, platform, kind: 'control', key: 'habits.form.suggestTags', evidence: [] }]
    const rule = { reason: 'The generation action is owned by this source.', targets: [`${platform}:control:habits.form.suggestDate`], owners: [owner] }
    const rules = { mappings: { [id]: rule } }
    validateRules(capability, rules, current.read)
    const before = compare(capability, scan(current, platform), rules)
    T(`${platform} a qualified mapping retains only its actual action owner`, before[0].disposition === 'retained' && before[0].redesign.length === 1 && before[0].redesign[0].file === owner)
    const multipleOwners = { mappings: { [id]: { ...rule, owners: [owner, sibling] } } }
    validateRules(capability, multipleOwners, current.read)
    T(`${platform} a mapping can qualify multiple same-platform owners`, compare(capability, scan(current, platform), multipleOwners)[0].redesign.length === 2)
    const invalidOwners = [null, [], '', owner, {}, { file: owner }, [null], [''], [sibling.replace(platform, platform === 'web' ? 'mobile' : 'web')], ['packages/shared/src/generator.tsx'], [`apps/${platform}/../${platform}/components/generator.tsx`], [owner + '/extra'], [owner.replace('generator', 'missing')], [owner, owner]]
    for (const owners of invalidOwners) {
      let rejected = false
      try { validateRules(capability, { mappings: { [id]: { ...rule, owners } } }, current.read) } catch { rejected = true }
      T(`${platform} invalid mapped owners are rejected: ${JSON.stringify(owners)}`, rejected)
    }
    for (const mapping of [null, [], 'owner', {}, { ...rule, owner }, { ...rule, unknown: true }]) {
      let rejected = false
      try { validateRules(capability, { mappings: { [id]: mapping } }, current.read) } catch { rejected = true }
      T(`${platform} empty or unknown mapping shapes are rejected: ${JSON.stringify(mapping)}`, rejected)
    }
    files[owner] = 'export function Generator() { return null }'
    const withoutOwner = scan(current, platform)
    T(`${platform} another identical Astra action cannot retain a deleted qualified owner`, newLosses(compare(capability, withoutOwner, rules), before).length === 1 && withoutOwner.some((entry) => entry.id === rule.targets[0] && entry.evidence.some((item) => item.file === sibling)))
    const unqualified = { reason: rule.reason, targets: rule.targets }
    validateRules(capability, { mappings: { [id]: unqualified } }, current.read)
    T(`${platform} mappings without owner qualification keep their existing semantics`, compare(capability, withoutOwner, { mappings: { [id]: unqualified } })[0].disposition === 'retained')
    files[sibling] = "export function DateAction() { return <button onClick={suggest}>{t('habits.form.suggestTags')}</button> }"
    const direct = compare(capability, scan(current, platform), rules)
    T(`${platform} direct legacy retention is independent of mapping owners`, direct[0].disposition === 'retained' && direct[0].redesign[0].file === sibling)
    files[sibling] = "export function DateAction() { return <button onClick={askDate}>{t('habits.form.suggestDate')}</button> }"
    const contentRules = { mappings: { [id]: { ...rule, targets: [`${platform}:content:habits.form.suggestDate`] } } }
    files[owner] = "export function Generator() { const caption = t('habits.form.suggestDate'); return <p>{caption}</p> }"
    const rendered = compare(capability, scan(current, platform), contentRules)
    T(`${platform} qualified content still needs its actual rendered consumer`, rendered[0].disposition === 'retained' && rendered[0].redesign.every((item) => item.file === owner))
    files[owner] = "export function Generator() { const caption = t('habits.form.suggestDate'); return null }"
    files[sibling] = "export function DateAction() { const caption = t('habits.form.suggestDate'); return <p>{caption}</p> }"
    T(`${platform} an unrendered owner and unrelated rendered content cannot satisfy qualification`, compare(capability, scan(current, platform), contentRules)[0].disposition === 'missing')
    files[owner] = "export function Generator() { const caption = 'habits.form.suggestDate'; return null }"
    T(`${platform} an unrendered source literal cannot satisfy qualification`, compare(capability, scan(current, platform), contentRules)[0].disposition === 'missing')
    files[owner] = "export function Generator() { return null }; function Unused() { return <p>{t('habits.form.suggestDate')}</p> }"
    T(`${platform} an unreachable owner declaration cannot satisfy qualification`, compare(capability, scan(current, platform), contentRules)[0].disposition === 'missing')
  }
}

function workflowRegressions(workflow) {
  const charter = run('check-gate-charter.mjs', [])
  T('the parity workflow satisfies its declared changed-file scope', charter.status === 0, charter.stderr)
  const comparison = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__1')
  const artifact = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__2')
  for (const step of [comparison, artifact]) {
    T(`${step.id} covers main pull requests`, step.if.includes("github.event_name == 'pull_request'") && step.if.includes("github.base_ref == 'main'"))
  }
  T('main production and debt comparisons use the immutable queued base', comparison.run.includes('--production "HEAD^1" --base "HEAD^1"') && comparison.run.includes('"$BASE_REF" = main'))
  T('evidence uploads even when the comparison fails', artifact.if.includes('always()') && artifact.with.path === manifestPath && artifact.with['include-hidden-files'] === true)
}

export const cases = () => {
  const workflow = yaml.load(readFileSync(join(REPO_ROOT, '.github/workflows/guards.yml'), 'utf8'))
  workflowRegressions(workflow)
  const artifact = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__2')
  T('Guards uploads the generated inventory from its hidden directory', artifact.with.path === manifestPath && artifact.with['include-hidden-files'] === true)
  const catalog = readFileSync(join(REPO_ROOT, 'packages/shared/src/i18n/en.json'), 'utf8')
  provenanceRegressions(catalog)
  promotionRegressions(catalog)
  mappedOwnerRegressions(catalog)
  const snapshot = (source, extra = {}) => {
    const files = {
      'packages/shared/src/i18n/en.json': catalog,
      'apps/web/app/page.tsx': source,
      ...extra,
    }
    return { paths: new Set(Object.keys(files)), read: (path) => files[path] }
  }
  const production = scan(snapshot("export default function Home() { return <button onClick={selectAll}>{t('habits.viewAll')}</button> }"), 'web').filter((entry) => entry.kind !== 'content')
  const unrelated = scan(snapshot("export default function Home() { return <button onClick={selectAll}>{t('common.all')}</button> }"), 'web')
  T('an unrelated All label cannot satisfy the Todos habit view', compare(production, unrelated, {}).find((entry) => entry.key === 'habits.viewAll')?.disposition === 'missing')
  const disconnected = scan(snapshot('export default function Home() { return <main /> }', {
    'apps/web/components/views.tsx': "export const Views = () => <button onClick={selectAll}>{t('habits.viewAll')}</button>",
  }), 'web')
  T('an unmounted file does not retain a capability', !disconnected.some((entry) => entry.key === 'habits.viewAll'))
  const connected = scan(snapshot("import { Views } from '../components/views'; export default function Home() { return <Views /> }", {
    'apps/web/components/views.tsx': "export const Views = () => <button onClick={selectAll}>{t('habits.viewAll')}</button>",
  }), 'web')
  T('a reachable control retains a capability', compare(production, connected, {}).find((entry) => entry.key === 'habits.viewAll')?.disposition === 'retained')
  const inert = scan(snapshot("export default function Home() { return <span>{t('habits.viewAll')}</span> }"), 'web')
  T('a label without an action does not retain a control', compare(production, inert, {}).find((entry) => entry.key === 'habits.viewAll')?.disposition === 'missing')
  const renamed = compare(production, unrelated, { mappings: { 'web:control:habits.viewAll': { targets: ['web:control:common.all'], reason: 'Explicit relocation fixture' } } })
  T('a reviewed relocation computes evidence from the target', renamed.find((entry) => entry.key === 'habits.viewAll')?.redesign[0]?.file === 'apps/web/app/page.tsx')
  const lost = compare(production, disconnected, { mappings: { 'web:control:habits.viewAll': { targets: ['web:control:common.all'] } }, tickets: { 'web:control:habits.viewAll': '#1423' } })
  T('a missing relocation remains missing and reports its ticket', lost.find((entry) => entry.key === 'habits.viewAll')?.disposition === 'missing' && lost.find((entry) => entry.key === 'habits.viewAll')?.ticket === '#1423')
  const barrel = scan(snapshot("import { Kept } from '../components'; export default function Home() { return <Kept /> }", {
    'apps/web/components/index.ts': "export { Kept } from './kept'; export { Lost } from './lost'",
    'apps/web/components/kept.tsx': 'export const Kept = () => <main />',
    'apps/web/components/lost.tsx': "export const Lost = () => <button onClick={selectAll}>{t('habits.viewAll')}</button>",
  }), 'web')
  T('an unused barrel export cannot retain a capability', !barrel.some((entry) => entry.key === 'habits.viewAll'))
  const unusedLocal = scan(snapshot("export default function Home() { return <main /> }; const Old = () => <button onClick={selectAll}>{t('habits.viewAll')}</button>"), 'web')
  T('an unused local component cannot retain a capability', !unusedLocal.some((entry) => entry.key === 'habits.viewAll'))
  const mobileFiles = {
    'packages/shared/src/i18n/en.json': catalog,
    'apps/mobile/app/index.tsx': `export default function Home() {
      const tabs = ['all'].map((view) => { let label; if (view === 'all') label = t('habits.viewAll'); return { view, label } });
      return <Tabs items={tabs} onSelect={selectView} />
    }`,
  }
  T('Android view labels assigned inside option builders enter the inventory', scan({ paths: new Set(Object.keys(mobileFiles)), read: (path) => mobileFiles[path] }, 'mobile').some((entry) => entry.id === 'mobile:control:habits.viewAll'))
  const missing = { id: 'web:control:habits.viewAll', disposition: 'missing', ticket: '#1423' }
  T('ticketed base debt is advisory', newLosses([missing], [missing]).length === 0)
  T('a ticket cannot exempt a capability restored on the base', newLosses([missing], [{ ...missing, disposition: 'retained' }]).length === 1)
  T('an unticketed base gap blocks', newLosses([{ ...missing, ticket: undefined }], [{ ...missing, ticket: undefined }]).length === 1)
  T('a ticketed gap restored in this tree is green', newLosses([{ ...missing, disposition: 'retained' }], [missing]).length === 0)
  const partial = compare(production, unrelated, { mappings: { 'web:control:habits.viewAll': { targets: ['web:control:common.all', 'web:control:absent'] } } })
  T('every relocation target is required', partial.find((entry) => entry.key === 'habits.viewAll')?.disposition === 'missing')
  let invalidCitation = false
  try { validateRules(production, { removals: { 'web:control:habits.viewAll': { reason: 'Removed', citation: 'DESIGN.md', rule: 'invented permission' } } }, () => 'No matching rule') } catch { invalidCitation = true }
  T('an unverified removal citation fails closed', invalidCitation)
  let invalidPlatform = false
  try { validateRules(production, { mappings: { 'web:control:habits.viewAll': { reason: 'Moved', targets: ['mobile:control:habits.viewAll'] } } }, () => '') } catch { invalidPlatform = true }
  T('Android evidence cannot satisfy a web capability', invalidPlatform)

  const restored = compare(production, connected, { mappings: { 'web:control:habits.viewAll': { targets: ['web:control:absent'] } } })
  T('restoring the original control satisfies an old relocation rule', restored.find((entry) => entry.key === 'habits.viewAll')?.disposition === 'retained')
  const allowedButPresent = compare(production, connected, { removals: { 'web:control:habits.viewAll': { citation: 'DESIGN.md', rule: 'fixture permission' } } })
  T('a permitted removal is still reported as retained while present', allowedButPresent.find((entry) => entry.key === 'habits.viewAll')?.disposition === 'retained')

  const nativeRoot = 'apps/mobile/modules/orbit-widget/android/src/main/'
  const provider = `${nativeRoot}java/org/useorbit/app/widget/OrbitWidgetProvider.kt`
  const nativeFiles = {
    'packages/shared/src/i18n/en.json': catalog,
    'apps/mobile/app/index.tsx': 'export default function Home() { return null }',
    [`${nativeRoot}AndroidManifest.xml`]: readFileSync(join(REPO_ROOT, nativeRoot, 'AndroidManifest.xml'), 'utf8'),
    [provider]: readFileSync(join(REPO_ROOT, provider), 'utf8'),
  }
  const nativeSnapshot = { paths: new Set(Object.keys(nativeFiles)), read: (path) => nativeFiles[path] }
  const native = scan(nativeSnapshot, 'mobile')
  T('the registered native widget exposes refresh', native.some((entry) => entry.id === 'mobile:native-control:widget.widget_refresh'))
  T('native open-app targets expand from the actual provider array', native.some((entry) => entry.id === 'mobile:native-control:widget.widget_root'))
  nativeFiles[provider] = nativeFiles[provider].replace('views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)', '')
  T('deleting the native refresh binding removes its capability', !scan(nativeSnapshot, 'mobile').some((entry) => entry.id === 'mobile:native-control:widget.widget_refresh'))

  const readout = scan(snapshot("export default function Home() { return <p>{t('orbitMcp.created')} {formatKeyDate(apiKey.createdAtUtc)}</p> }"), 'web')
  T('read-only values beside translated labels are capabilities', readout.some((entry) => entry.id === 'web:display:orbitMcp.created'))
  const interpolated = scan(snapshot("export default function Home() { return <p>{t('profile.apiKeys.activeCount', { count: apiKeys.length })}</p> }"), 'web')
  T('interpolated figures are capabilities', interpolated.some((entry) => entry.id === 'web:display:profile.apiKeys.activeCount'))
  const scoped = scan(snapshot(`function First() { const t = useTranslations('chat'); return <button onClick={open}>{t('title')}</button> }
    function Second() { const t = useTranslations('profile.support'); return <button onClick={open}>{t('title')}</button> }
    export default function Home() { return <><First /><Second /></> }`), 'web')
  T('translation namespaces follow their owning function', scoped.some((entry) => entry.id === 'web:control:chat.title') && scoped.some((entry) => entry.id === 'web:control:profile.support.title'))
  const noDefault = scan(snapshot('export function FormerPage() { return <main /> }'), 'web')
  T('a route file without its default export is missing', !noDefault.some((entry) => entry.kind === 'route'))

  const genericOptions = scan(snapshot("import { options } from '../components/options'; export default function Home() { return <Tabs items={options('all')} onSelect={selectView} /> }", {
    'apps/web/components/options.ts': "export const options = <T>(value: T) => ({ value, label: t('habits.viewAll') })",
  }), 'web')
  T('TypeScript option builders retain generic arrow syntax', genericOptions.some((entry) => entry.id === 'web:control:habits.viewAll'))

  for (const platform of ['web', 'mobile']) {
    const files = {
      'packages/shared/src/i18n/en.json': catalog,
      [`apps/${platform}/app/${platform === 'web' ? 'page' : 'index'}.tsx`]: `
        import { useWords } from '../words'; import { Controls } from '../controls';
        export default function Home() { const { unused, ...words } = useWords(); return <Controls words={words} /> }
      `,
      [`apps/${platform}/words.ts`]: "export function useWords() { return { unused: false, file: t('habits.viewAll'), image: t('common.all') } }",
      [`apps/${platform}/controls.tsx`]: `
        export function Controls({ words }) { const { file: caption } = words; return <button onClick={open}>{caption}</button> }
      `,
    }
    const current = { paths: new Set(Object.keys(files)), read: (path) => files[path] }
    const capability = [{ id: `${platform}:control:habits.viewAll`, platform, kind: 'control', key: 'habits.viewAll', evidence: [] }]
    const mapping = { mappings: { [capability[0].id]: { targets: [`${platform}:content:habits.viewAll`] } } }
    const before = compare(capability, scan(current, platform), mapping)
    T(`${platform} mapped word aliases follow rest props and renamed destructuring`, before[0].disposition === 'retained')
    files[`apps/${platform}/controls.tsx`] = `
      export function Controls({ words }) { const unused = { file: words.file }; return <button onClick={open}>{words.image}</button> }
    `
    const after = compare(capability, scan(current, platform), mapping)
    T(`${platform} unused bindings and a rendered sibling word cannot retain the mapped control`, newLosses(after, before).length === 1)
    files[`apps/${platform}/controls.tsx`] = `
      export function Controls({ words }) { const unrelated = { file: t('common.all') }; return <button onClick={open}>{unrelated.file}</button> }
    `
    T(`${platform} an unrelated object with the same property name cannot retain the mapped control`, compare(capability, scan(current, platform), mapping)[0].disposition === 'missing')
    files[`apps/${platform}/controls.tsx`] = `
      function Inert({ image }) { return <button onClick={open}>{image}</button> }
      export function Controls({ words }) { return <Inert unused={words.file} image={words.image} /> }
    `
    T(`${platform} an unread scalar prop cannot retain the mapped control`, compare(capability, scan(current, platform), mapping)[0].disposition === 'missing')
    files[`apps/${platform}/controls.tsx`] = `
      function Forwarded({ unused, ...props }) { return <button onClick={open} {...props} /> }
      export function Controls({ words }) { return <Forwarded aria-label={words.file} unused={words.image} /> }
    `
    T(`${platform} forwarded accessibility props retain the mapped control`, compare(capability, scan(current, platform), mapping)[0].disposition === 'retained')
    files[`apps/${platform}/controls.tsx`] = `
      function Stripped({ 'aria-label': unused, ...props }) { return <button onClick={open} {...props} /> }
      export function Controls({ words }) { return <Stripped aria-label={words.file} /> }
    `
    T(`${platform} a removed rest property cannot retain the mapped control`, compare(capability, scan(current, platform), mapping)[0].disposition === 'missing')
  }

  const rules = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/feature-parity-rules.json'), 'utf8'))
  const fixture = generatedInventory(catalog, rules, 'parity-source')
  T('the CLI generates a temporary inventory from source without a recorded manifest', fixture.generated.status === 0, fixture.generated.stderr)
  T('the generated parity inventory is not tracked', fixture.tracked === '')
  const { inventory } = fixture
  for (const platform of ['web', 'mobile']) {
    for (const document of ['privacy', 'terms']) {
      const path = platform === 'web' ? `apps/web/app/(public)/${document}/page.tsx` : `apps/mobile/app/${document}.tsx`
      // Production legal pages render section labels above always-visible bodies.
      const source = platform === 'web' ? `export default function LegalPage() {
        const sections = [{ label: t('${document}.intro.title'), body: t('${document}.intro.body') }];
        return <main>{sections.map(({ label, body }) => <div><SectionLabel>{label}</SectionLabel><p>{body}</p></div>)}</main>
      }` : `export default function LegalPage() {
        return <ScrollView><SectionLabel>{t('${document}.intro.title')}</SectionLabel><Text>{t('${document}.intro.body')}</Text></ScrollView>
      }`
      const files = { 'packages/shared/src/i18n/en.json': catalog, [path]: source }
      const current = { paths: new Set(Object.keys(files)), read: (file) => files[file] }
      const headings = scan(current, platform, rules).filter((entry) => entry.key === `${document}.intro.title`)
      T(`${platform} ${document} static section headings are content, not capabilities`, headings.length === 1 && headings[0].kind === 'content')
      T(`${platform} ${document} inventory excludes static section heading capabilities`, !inventory.entries.some((entry) => entry.platform === platform && new RegExp(`^${document}\\.[^.]+\\.title$`).test(entry.key)))
      files[path] = `export default function LegalPage() { return <button onClick={open}>{t('${document}.intro.title')}</button> }`
      T(`${platform} ${document} real actions still enter the inventory`, scan(current, platform, rules).some((entry) => entry.id === `${platform}:control:${document}.intro.title`))
      if (platform === 'web') {
        files[path] = source.replace(`label: t('${document}.intro.title')`, `label: '${document}.intro.title'`)
        T(`${document} literal heading keys are also content`, scan(current, platform, rules).filter((entry) => entry.key === `${document}.intro.title`).every((entry) => entry.kind === 'content'))
        const elsewhere = snapshot(source)
        T(`${document} label bindings outside legal pages remain capabilities`, scan(elsewhere, platform, rules).some((entry) => entry.id === `${platform}:control:${document}.intro.title`))
      }
    }
  }
  inventoryRegressions(fixture)
}
