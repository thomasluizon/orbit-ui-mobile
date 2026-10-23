import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

import { T, REPO_ROOT, root, stage, run } from './_harness.mjs'
import { scan, compare, validateRules, newLosses } from '../check-feature-parity.mjs'

const manifestPath = '.claude/manifests/feature-parity.json'
const restoredRuleIds = [
  'web:control:habits.form.emojiSuggest', 'web:control:habits.form.emojiSuggesting',
  'web:control:orbitMcp.configInstructions', 'web:control:orbitMcp.replaceKey',
  'mobile:display:orbitMcp.replaceKey',
  'web:control:shell.collapseSidebar', 'web:control:shell.expandSidebar',
  'web:display:orbitMcp.created', 'web:display:orbitMcp.lastUsed',
  ...['web', 'mobile'].flatMap((platform) => ['yes', 'no'].map((value) => `${platform}:display:common.${value}`)),
]
const formRuleIds = [
  ...['web', 'mobile'].flatMap((platform) => [
    ...['habits.actions.reschedule', 'habits.form.suggestTags', 'habits.reschedule.retry'].map((key) => `${platform}:control:${key}`),
    ...['common.selectedDate', 'habits.form.dateProposed'].map((key) => `${platform}:display:${key}`),
  ]),
  'web:display:habits.form.suggestTags',
]

function generatedInventory(catalog, rules) {
  const directory = join(root, 'parity-source')
  const put = (path, source) => stage(`parity-source/${path}`, source)
  const git = (args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  const fixtureCatalog = JSON.parse(catalog)
  const files = {
    '.gitignore': readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8'),
    'tools/feature-parity-rules.json': JSON.stringify({ staticHeadingLabels: rules.staticHeadingLabels }),
    'packages/shared/src/parity-controls.tsx': `export function First() { return <button onClick={open}>{t('habits.viewAll')}</button> }${'\n'.repeat(12)}export function Second() { return <button onClick={open}>{t('common.all')}</button> }\n`,
  }
  for (const platform of ['web', 'mobile']) {
    const ids = Object.entries(rules.tickets).filter(([id, ticket]) => id.startsWith(`${platform}:`) && ticket === '#1447').map(([id]) => id)
    ids.push(...restoredRuleIds.filter((id) => id.startsWith(`${platform}:`)))
    ids.push(...formRuleIds.filter((id) => id.startsWith(`${platform}:`)))
    ids.push(...['common.nextWeek', 'common.previousWeek', 'common.selectDate', 'common.selectedDate', 'chat.attachFile', 'gamification.levelUp.title', 'goals.completedCelebrationTitle'].map((key) => `${platform}:control:${key}`))
    if (platform === 'web') ids.push('web:control:calendar.agenda.nextDay', 'web:control:calendar.agenda.previousDay')
    for (const id of ids) fixtureCatalog[id.split(':')[2]] = id.split(':')[2]
    const labels = ids.map((id) => id.includes(':display:')
      ? `<p>{t('${id.split(':')[2]}', { count: 1 })}</p>`
      : `<button onClick={open}>{t('${id.split(':')[2]}')}</button>`).join('\n')
    files[`apps/${platform}/app/${platform === 'web' ? 'page' : 'index'}.tsx`] = `import { First, Second } from '../../../packages/shared/src/parity-controls'; export default function Home() { return <><First /><Second />${labels}</> }`
    for (const document of ['privacy', 'terms']) {
      const path = platform === 'web' ? `apps/web/app/(public)/${document}/page.tsx` : `apps/mobile/app/${document}.tsx`
      files[path] = `export default function Legal() { return <p>{t('${document}.intro.title')}</p> }`
    }
  }
  files['packages/shared/src/i18n/en.json'] = JSON.stringify(fixtureCatalog)
  for (const [path, source] of Object.entries(files)) put(path, source)
  git(['init', '-q', '--initial-branch=production'])
  git(['config', 'user.email', 'gate@orbit.test'])
  git(['config', 'user.name', 'Orbit Gate'])
  git(['add', ...Object.keys(files)])
  git(['commit', '-q', '-m', 'Production source fixture'])
  const provenance = { legacyProduction: git(['rev-parse', 'HEAD']) }
  put('tools/feature-parity-rules.json', JSON.stringify({ provenance, staticHeadingLabels: rules.staticHeadingLabels }))
  mkdirSync(join(directory, '.claude/manifests'), { recursive: true })
  const generate = (extra = []) => run('check-feature-parity.mjs', ['--root', directory, '--production', 'production', '--write', ...extra])
  const generated = generate(['--ci', '--base', 'production'])
  T('the CLI generates a temporary inventory from source without a recorded manifest', generated.status === 0, generated.stderr)
  const inventory = JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
  const tracked = execFileSync('git', ['ls-files', manifestPath], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  T('the generated parity inventory is not tracked', tracked === '')
  if (tracked) git(['add', manifestPath])
  git(['commit', '-q', '--allow-empty', '-m', 'Generated inventory policy fixture'])
  return { directory, put, git, generate, inventory, provenance, source: files['packages/shared/src/parity-controls.tsx'] }
}

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

function invalidPromotionInputs({ put, git, check, rules, legacyRevision, promoted }) {
  const invalidRules = [
    ['missing provenance', { ...rules, provenance: undefined }, /provenance/],
    ['unknown provenance field', { ...rules, provenance: { ...rules.provenance, ignored: legacyRevision } }, /provenance/],
    ['floating legacy reference', { ...rules, provenance: { legacyProduction: 'main' } }, /immutable/],
    ['missing legacy object', { ...rules, provenance: { legacyProduction: 'f'.repeat(40) } }, /./],
    ['noncommit legacy object', { ...rules, provenance: { legacyProduction: git(['rev-parse', `${legacyRevision}^{tree}`]) } }, /./],
    ['wrong era provenance', { ...rules, provenance: { legacyProduction: promoted } }, /no production capability/],
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
  put('tools/feature-parity-rules.json', JSON.stringify(rules))
  T('an invalid active production reference fails closed', check('missing-production').status === 2)
  T('an invalid queued base fails closed', check(legacyRevision, 'missing-base').status === 2)
}


function referralRuleRegressions(platform, current, files, rules, observations) {
  const capabilities = ['drawer.couponsEarned', 'drawer.disclaimer', 'drawer.explanation', 'prompt.body']
    .map((key) => ({ id: `${platform}:display:referral.${key}`, platform, kind: 'display', key: `referral.${key}`, evidence: [] }))
  const retained = compare(capabilities, observations, rules)
  T(`${platform} referral figures and reward copy retain all four legacy capabilities`, retained.length === 4 && retained.every((entry) => entry.disposition === 'retained' && entry.redesign.length > 0), retained.filter((entry) => entry.disposition !== 'retained').map((entry) => entry.id).join(', '))
  const drawer = `apps/${platform}/components/referral/referral-drawer.tsx`
  const prompt = `apps/${platform}/components/referral/referral-prompt.tsx`
  const originals = new Map([drawer, prompt].map((path) => [path, files[path]]))
  files[drawer] = 'export function ReferralDrawer() { return null }'
  files[prompt] = 'export function ReferralPrompt() { return null }'
  const removed = compare(capabilities, scan(current, platform, rules), rules)
  T(`${platform} share copy cannot retain deleted referral figures and explanations`, removed.length === 4 && removed.every((entry) => entry.disposition === 'missing'), removed.filter((entry) => entry.disposition !== 'missing').map((entry) => entry.id).join(', '))
  for (const [path, source] of originals) files[path] = source
}

function restoredRuleRegressions(platform, current, files, inventory, rules, observations) {
  const capabilities = inventory.entries.filter((entry) => restoredRuleIds.includes(entry.id) && entry.platform === platform)
  const retained = compare(capabilities, observations, rules)
  T(`${platform} closed restoration tickets resolve to their actual rendered replacements`, retained.length === restoredRuleIds.filter((id) => id.startsWith(`${platform}:`)).length && retained.every((entry) => entry.disposition === 'retained' && entry.redesign.length > 0), retained.filter((entry) => entry.disposition !== 'retained').map((entry) => entry.id).join(', '))
  const paths = [...new Set(retained.flatMap((entry) => entry.redesign.map((item) => item.file)))]
  const originals = new Map(paths.map((path) => [path, files[path]]))
  for (const path of paths) {
    if (path.endsWith('habit-emoji-selector.tsx')) {
      const button = /<EmojiSuggestionButton\b[^>]*\/>/g
      T(`${platform} the current emoji generation owner is removed exactly once`, [...files[path].matchAll(button)].length === 1)
      files[path] = files[path].replace(button, '{null}')
    }
    else if (path.endsWith('shell-wide.tsx')) files[path] = files[path].replace('aria-label={toggleLabel}', '').replace('title={toggleLabel}', '')
    else if (path.endsWith('mcp-code-client.tsx')) files[path] = files[path].split('\n').filter((line) => !line.includes("t('orbitMcp.configInstructions')") && !line.includes("t('orbitMcp.replaceKey')")).join('\n')
    else if (path.endsWith('profile-api-keys.tsx')) files[path] = files[path].split('\n').filter((line) => !line.includes("t('orbitMcp.created')") && !line.includes("t('orbitMcp.lastUsed')") && !line.includes("apiKey.isReadOnly ? t('orbitMcp.permReadOnly')")).join('\n')
    T(`${platform} the restoration evidence source is deliberately broken`, files[path] !== originals.get(path), path)
  }
  const removed = compare(capabilities, scan(current, platform), rules)
  T(`${platform} closed restoration tickets cannot exempt lost replacements`, newLosses(removed, retained).length === capabilities.length, removed.filter((entry) => entry.disposition !== 'missing').map((entry) => entry.id).join(', '))
  T(`${platform} removing restoration owners retains manual emoji picking and other Astra actions`, files[`apps/${platform}/components/habits/habit-form-fields/habit-emoji-selector.tsx`].includes('handleSelectEmoji(emoji)') && scan(current, platform).some((entry) => entry.id === `${platform}:control:habits.form.askDate`))
  for (const [path, source] of originals) files[path] = source
  T(`${platform} restoring every closed restoration owner leaves no new losses`, newLosses(compare(capabilities, scan(current, platform), rules), retained).length === 0)
}

function mappedOwnerRegressions(catalog) {
  for (const platform of ['web', 'mobile']) {
    const owner = `apps/${platform}/components/generator.tsx`
    const sibling = `apps/${platform}/components/date.tsx`
    const route = `apps/${platform}/app/${platform === 'web' ? 'page' : 'index'}.tsx`
    const files = {
      'packages/shared/src/i18n/en.json': catalog,
      [route]: "import { Generator } from '../components/generator'; import { DateAction } from '../components/date'; export default function Home() { return <><Generator /><DateAction /></> }",
      [owner]: "export function Generator() { return <button onClick={suggest}>{t('habits.form.askDate')}</button> }",
      [sibling]: "export function DateAction() { return <button onClick={askDate}>{t('habits.form.askDate')}</button> }",
    }
    const current = { paths: new Set(Object.keys(files)), read: (path) => {
      if (!(path in files)) throw new Error(`missing source: ${path}`)
      return files[path]
    } }
    const id = `${platform}:control:habits.form.suggestTags`
    const capability = [{ id, platform, kind: 'control', key: 'habits.form.suggestTags', evidence: [] }]
    const rule = { reason: 'The generation action is owned by this source.', targets: [`${platform}:control:habits.form.askDate`], owners: [owner] }
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
    files[sibling] = "export function DateAction() { return <button onClick={askDate}>{t('habits.form.askDate')}</button> }"
    const contentRules = { mappings: { [id]: { ...rule, targets: [`${platform}:content:habits.form.askDate`] } } }
    files[owner] = "export function Generator() { const caption = t('habits.form.askDate'); return <p>{caption}</p> }"
    const rendered = compare(capability, scan(current, platform), contentRules)
    T(`${platform} qualified content still needs its actual rendered consumer`, rendered[0].disposition === 'retained' && rendered[0].redesign.every((item) => item.file === owner))
    files[owner] = "export function Generator() { const caption = t('habits.form.askDate'); return null }"
    files[sibling] = "export function DateAction() { const caption = t('habits.form.askDate'); return <p>{caption}</p> }"
    T(`${platform} an unrendered owner and unrelated rendered content cannot satisfy qualification`, compare(capability, scan(current, platform), contentRules)[0].disposition === 'missing')
    files[owner] = "export function Generator() { const caption = 'habits.form.askDate'; return null }"
    T(`${platform} an unrendered source literal cannot satisfy qualification`, compare(capability, scan(current, platform), contentRules)[0].disposition === 'missing')
    files[owner] = "export function Generator() { return null }; function Unused() { return <p>{t('habits.form.askDate')}</p> }"
    T(`${platform} an unreachable owner declaration cannot satisfy qualification`, compare(capability, scan(current, platform), contentRules)[0].disposition === 'missing')
  }
}

function invocationRuleRegressions(platform, current, files, inventory, rules, observations) {
  const ids = formRuleIds.filter((id) => id.startsWith(`${platform}:`) && !id.includes('common.selectedDate') && !id.includes('dateProposed'))
  const capabilities = inventory.entries.filter((entry) => ids.includes(entry.id))
  const before = compare(capabilities, observations, rules)
  T(`${platform} current form invocation owners retain every original obligation`, before.length === ids.length && before.every((entry) => entry.disposition === 'retained' && entry.redesign.length > 0))
  const prefix = `apps/${platform}/components/habits/`
  const mutations = [
    ['tag generation', `${prefix}habit-form-fields/tag-suggestions.tsx`, /<PillButton minimumHeight=\{48\}[\s\S]*?<\/PillButton>/g, ids.filter((id) => id.endsWith('habits.form.suggestTags'))],
    ['reschedule retry', `${prefix}reschedule-sheet.tsx`, /<PillButton leadingIcon=\{<AstraGlyph size=\{16\} \/>\} variant=\{filledVariant\} size="sm" onClick=\{\(\) => void refetch\(\)\}>\s*\{t\('habits.form.askDate'\)\}\s*<\/PillButton>/g, [`${platform}:control:habits.reschedule.retry`]],
    ['reschedule menu', `${prefix}${platform === 'web' ? 'habit-row-trailing' : 'habit-row'}.tsx`, /^.*items\.push\(\{ id: 'reschedule',.*\n/gm, [`${platform}:control:habits.actions.reschedule`]],
  ]
  for (const [name, path, pattern, missingIds] of mutations) {
    const original = files[path]
    T(`${platform} ${name} mutation matches exactly one current owner`, [...original.matchAll(pattern)].length === 1)
    files[path] = original.replace(pattern, '')
    const afterObservations = scan(current, platform, rules)
    const after = compare(capabilities, afterObservations, rules)
    const losses = newLosses(after, before).map((entry) => entry.id).sort()
    T(`${platform} deleting ${name} blocks exactly its original obligations`, JSON.stringify(losses) === JSON.stringify([...missingIds].sort()), losses.join(', '))
    T(`${platform} deleting ${name} retains the other Astra owners and manual tag picker`, ['habit-date-field.tsx', 'habit-emoji-selector.tsx'].every((owner) => afterObservations.some((entry) => entry.id === `${platform}:control:habits.form.askDate` && entry.evidence.some((item) => item.file.endsWith(owner)))) && afterObservations.some((entry) => entry.id === `${platform}:control:habits.form.tags`))
    T(`${platform} deleting ${name} preserves deterministic acceptance, recovery and other row actions`, files[`${prefix}habit-form-fields/tag-suggestions.tsx`].includes('suggestions.acceptSuggestion(suggestion)') && files[`${prefix}habit-form-fields/tag-suggestions.tsx`].includes('getFriendlyErrorMessage') && files[`${prefix}reschedule-sheet.tsx`].includes("t('habits.reschedule.dismiss')") && files[`${prefix}reschedule-sheet.tsx`].includes("t('habits.reschedule.accept')") && ['edit', 'skip', 'drill'].every((key) => files[`${prefix}${platform === 'web' ? 'habit-row-trailing' : 'habit-row'}.tsx`].includes(`id: '${key}'`)))
    files[path] = original
    T(`${platform} restoring ${name} leaves no new invocation losses`, newLosses(compare(capabilities, scan(current, platform, rules), rules), before).length === 0)
  }
  for (const [file, key] of [['habit-emoji-selector.tsx', 'emojiSuggesting'], ['tag-suggestions.tsx', 'suggestingTags']]) {
    const path = `${prefix}habit-form-fields/${file}`
    const original = files[path]
    const pending = observations.filter((entry) => entry.id === `${platform}:control:habits.form.${key}`)
    const pendingBefore = compare(pending, observations, rules)
    const translation = `t('habits.form.${key}')`
    T(`${platform} ${key} mutation matches one current pending hint`, original.split(translation).length === 2 && pending.length === 1)
    files[path] = original.replace(translation, 'undefined')
    const after = scan(current, platform, rules)
    T(`${platform} removing ${key} blocks its pending obligation while retaining generation`, newLosses(compare(pending, after, rules), pendingBefore).length === 1 && after.some((entry) => entry.id === `${platform}:control:habits.form.askDate` && entry.evidence.some((item) => item.file === path)))
    if (platform === 'web' && key === 'suggestingTags') T('web tag context mapping requires its pending evidence as well as its action', newLosses(compare(capabilities, after, rules), before).map((entry) => entry.id).join() === 'web:display:habits.form.suggestTags')
    files[path] = original
    T(`${platform} restoring ${key} leaves no pending or invocation losses`, newLosses(compare([...capabilities, ...pending], scan(current, platform, rules), rules), [...before, ...pendingBefore]).length === 0)
  }
}

function workflowRegressions(workflow) {
  const charter = run('check-gate-charter.mjs', [])
  T('the parity workflow satisfies its declared changed-file scope', charter.status === 0, charter.stderr)
  const comparison = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__1')
  const artifact = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__2')
  for (const step of [comparison, artifact]) {
    T(`${step.id} covers main and supported redesign pull requests`, step.if.includes("github.event_name == 'pull_request'") && step.if.includes("github.base_ref == 'main'") && step.if.includes("github.base_ref == 'redesign/main'"))
  }
  T('main production and debt comparisons use the immutable queued base', comparison.run.includes('--production "HEAD^1" --base "HEAD^1"') && comparison.run.includes('"$BASE_REF" = main'))
  T('redesign retains active production and an immutable queued debt base', comparison.run.includes('--production origin/main --base "HEAD^1"'))
  T('evidence uploads even when the comparison fails', artifact.if.includes('always()') && artifact.with.path === manifestPath && artifact.with['include-hidden-files'] === true)
}

function promptLibraryRegressions(current, files, rules) {
  const owner = 'apps/web/components/chat/prompt-library.tsx'
  const original = files[owner]
  const id = 'web:display:chat.templates.forYou'
  const capability = [{ id, platform: 'web', kind: 'display', key: 'chat.templates.forYou', evidence: [] }]
  const observations = scan(current, 'web', rules)
  const content = observations.find((entry) => entry.id === 'web:content:chat.templates.forYou')
  T('For You has actual reachable web heading and region consumers', content?.consumers.length === 2 && content.consumers.every((item) => item.file === owner))
  const before = compare(capability, observations, rules)
  T('the production For You display obligation resolves to web PromptLibrary', before[0].disposition === 'retained' && before[0].redesign.length === 2 && before[0].redesign.every((item) => item.file === owner))
  files[owner] = original.replace(/<h2[^\n]*\{t\('chat.templates.forYou'\)\}<\/h2>/, '')
  T('the heading fault leaves the real live section label', files[owner] !== original && files[owner].includes("aria-label={t('chat.templates.forYou')}"))
  T('the live section accessible label remains separate static retention evidence', compare(capability, scan(current, 'web', rules), rules)[0].disposition === 'retained')
  files[owner] = files[owner].replace(" aria-label={t('chat.templates.forYou')}", '')
    .replace('const locale = useLocale()', "const unusedForYou = t('chat.templates.forYou')\n  const locale = useLocale()")
  T('the owner fault preserves live callbacks, catalog groups and the translated key', files[owner].includes('props.suggestions.map') && files[owner].includes('<CatalogGroup') && files[owner].includes("const unusedForYou = t('chat.templates.forYou')") && JSON.parse(files['packages/shared/src/i18n/en.json']).chat.templates.forYou === 'For you now')
  const withoutOwners = scan(current, 'web', rules)
  const after = compare(capability, withoutOwners, rules)
  T('an unused translation cannot retain the removed For You consumers', withoutOwners.find((entry) => entry.id === 'web:content:chat.templates.forYou')?.consumers.length === 0 && after[0].disposition === 'missing')
  T('removing the actual For You owners blocks the original production obligation', newLosses(after, before).some((entry) => entry.id === id))
  files[owner] = original
  const restored = compare(capability, scan(current, 'web', rules), rules)
  T('restoring the actual For You owners retains the production obligation again', restored[0].disposition === 'retained' && newLosses(restored, before).length === 0)
}

export const cases = () => {
  const workflow = yaml.load(readFileSync(join(REPO_ROOT, '.github/workflows/guards.yml'), 'utf8'))
  workflowRegressions(workflow)
  const artifact = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__2')
  T('Guards uploads the generated inventory from its hidden directory', artifact.with.path === manifestPath && artifact.with['include-hidden-files'] === true)
  const catalog = readFileSync(join(REPO_ROOT, 'packages/shared/src/i18n/en.json'), 'utf8')
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
  const fixture = generatedInventory(catalog, rules)
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
  for (const platform of ['mobile', 'web']) {
    const files = { 'packages/shared/src/i18n/en.json': catalog }
    function load(directory) {
      for (const name of readdirSync(join(REPO_ROOT, directory), { withFileTypes: true })) {
        const path = `${directory}/${name.name}`
        if (name.isDirectory() && !/^(?:node_modules|\.next|\.expo|__tests__|e2e)$/.test(name.name)) load(path)
        else if (name.isFile() && /\.[jt]sx?$/.test(path)) files[path] = readFileSync(join(REPO_ROOT, path), 'utf8')
      }
    }
    load(`apps/${platform}`)
    load('packages/shared/src')
    const current = { paths: new Set(Object.keys(files)), read: (path) => files[path] }
    if (platform === 'web') promptLibraryRegressions(current, files, rules)
    const apiKeys = `apps/${platform}/components/profile/profile-api-keys.tsx`
    const currentObservations = scan(current, platform)
    referralRuleRegressions(platform, current, files, rules, currentObservations)
    const currentControls = currentObservations.filter((entry) => entry.kind !== 'content')
    const originalApiKeys = files[apiKeys]
    const entry = /<ListRow\s+compact\s+icon=\{<Key[\s\S]*?onClick=\{\(\) => setShowStepUp\(true\)\}\s*\/>/
    T(`${platform} the actual API-key entry is reachable before mutation`, entry.test(originalApiKeys) && currentControls.some((capability) => capability.id === `${platform}:control:profile.apiKeys.open`))
    files[apiKeys] = originalApiKeys.replace(entry, '{null}')
    const withoutEntry = scan(current, platform)
    const entryLosses = newLosses(compare(currentControls, withoutEntry, rules), compare(currentControls, currentObservations, rules))
    T(`${platform} removing the actual API-key entry blocks a current production loss`, entryLosses.some((capability) => capability.id === `${platform}:control:profile.apiKeys.open`))
    const legacyEntry = [{ id: `${platform}:control:advancedSettings.title`, platform, kind: 'control', key: 'advancedSettings.title', evidence: [] }]
    T(`${platform} removing the actual API-key entry also blocks its legacy relocation`, newLosses(compare(legacyEntry, withoutEntry, rules), compare(legacyEntry, currentObservations, rules)).length === 1)
    files[apiKeys] = originalApiKeys
    restoredRuleRegressions(platform, current, files, inventory, rules, currentObservations)
    invocationRuleRegressions(platform, current, files, inventory, rules, currentObservations)
    const keyOwner = `apps/${platform}/components/profile/profile-api-keys.tsx`
    const noExpiryId = `${platform}:display:common.never`
    const keyObservations = scan(current, platform, rules)
    const keyCapabilities = keyObservations.filter((entry) => entry.id === noExpiryId)
    const beforeKey = compare(keyCapabilities, keyObservations, rules)
    T(`${platform} no-expiry metadata resolves to the existing key details output`, beforeKey.length === 1 && beforeKey[0].disposition === 'retained' && beforeKey[0].redesign.every((item) => item.file === keyOwner))
    const originalKeyOwner = files[keyOwner]
    files[keyOwner] = originalKeyOwner.replace(": t('common.never')}</", ': null}</')
    T(`${platform} mutation removes no-expiry output while retaining the input placeholder`, files[keyOwner] !== originalKeyOwner && files[keyOwner].includes("placeholder={t('common.never')}"))
    const afterKey = compare(keyCapabilities, scan(current, platform, rules), rules)
    T(`${platform} the creation placeholder cannot retain deleted no-expiry metadata`, afterKey.length === 1 && afterKey[0].disposition === 'missing')
    T(`${platform} removing restored no-expiry metadata blocks parity`, newLosses(afterKey, beforeKey).some((entry) => entry.id === noExpiryId))
    files[keyOwner] = originalKeyOwner
    const dateField = `apps/${platform}/components/ui/date-field.tsx`
    const dateCapabilities = inventory.entries.filter((entry) => ['common.selectDate', 'common.selectedDate'].some((key) => entry.id === `${platform}:control:${key}`))
    const beforeDate = compare(dateCapabilities, scan(current, platform, rules), rules)
    T(`${platform} legacy date selection resolves to its rendered field`, beforeDate.length === 2 && beforeDate.every((entry) => entry.disposition === 'retained' && entry.redesign.some((item) => item.file === dateField)))
    const originalDateField = files[dateField]
    const selectedDate = inventory.entries.filter((entry) => entry.id === `${platform}:display:common.selectedDate`)
    const beforeReadback = compare(selectedDate, scan(current, platform, rules), rules)
    T(`${platform} the selected-date display obligation resolves to the picker readback`, beforeReadback.length === 1 && beforeReadback[0].disposition === 'retained' && beforeReadback[0].redesign.some((item) => item.file === dateField))
    files[dateField] = 'export function DateField() { return null }'
    const withoutDateField = scan(current, platform, rules)
    T(`${platform} removing the date field removes its selected-date readback`, !withoutDateField.some((entry) => entry.key === 'common.selectedDate'))
    const afterDate = compare(dateCapabilities, withoutDateField, rules)
    T(`${platform} deleted date selection cannot be retained by other form content`, afterDate.every((entry) => entry.disposition === 'missing'))
    T(`${platform} removing the date field blocks both legacy date capabilities`, newLosses(afterDate, beforeDate).length === 2)
    T(`${platform} removing the date field also blocks its selected-date display obligation`, newLosses(compare(selectedDate, withoutDateField, rules), beforeReadback).length === 1)
    files[dateField] = originalDateField
    const proposed = inventory.entries.filter((entry) => entry.id === `${platform}:display:habits.form.dateProposed`)
    const beforeProposed = compare(proposed, scan(current, platform, rules), rules)
    const candidateOwner = `apps/${platform}/components/habits/habit-form-fields/habit-date-field.tsx`
    const originalCandidate = files[candidateOwner]
    const proposedLabel = "t('habits.form.dateProposed')"
    T(`${platform} the real Proposed label and status are both present`, originalCandidate.split(proposedLabel).length === 3 && beforeProposed.length === 1 && beforeProposed[0].disposition === 'retained')
    files[candidateOwner] = originalCandidate.replaceAll(proposedLabel, "''")
    T(`${platform} the Proposed mutation retains manual selection and acceptance callbacks`, files[candidateOwner] !== originalCandidate && files[candidateOwner].includes('editor.selectDate(value)') && files[candidateOwner].includes('editor.accept()') && files[dateField] === originalDateField)
    const withoutProposed = scan(current, platform, rules)
    T(`${platform} deleting candidate Proposed evidence blocks its original display obligation`, newLosses(compare(proposed, withoutProposed, rules), beforeProposed).length === 1)
    T(`${platform} deleting Proposed evidence retains date selection and readback`, compare([...dateCapabilities, ...selectedDate], withoutProposed, rules).every((entry) => entry.disposition === 'retained'))
    files[candidateOwner] = originalCandidate
    T(`${platform} restoring date owners leaves no selection, readback or Proposed losses`, newLosses(compare([...dateCapabilities, ...selectedDate, ...proposed], scan(current, platform, rules), rules), [...beforeDate, ...beforeReadback, ...beforeProposed]).length === 0)
    const guide = `apps/${platform}/components/profile/profile-mcp-guide.tsx`
    const guideCapabilities = inventory.entries.filter((entry) => entry.platform === platform && rules.tickets[entry.id] === '#1447')
    const beforeGuide = compare(guideCapabilities, scan(current, platform), rules)
    T(`${platform} every MCP web guide capability resolves to reachable rendered output`, beforeGuide.length === (platform === 'web' ? 8 : 3) && beforeGuide.every((entry) => entry.disposition === 'retained' && entry.redesign.length > 0))
    const originalGuide = files[guide]
    files[guide] = 'export function ProfileMcpGuide() { return null }'
    const afterGuide = compare(guideCapabilities, scan(current, platform), rules)
    const selectorCapabilities = new Set([
      `${platform}:control:orbitMcp.claudeWeb`,
      `${platform}:${platform === 'web' ? 'control' : 'display'}:orbitMcp.webNoApiKey`,
    ])
    T(`${platform} removing the MCP web guide retains only selector-owned capabilities`, afterGuide.every((entry) => entry.disposition === (selectorCapabilities.has(entry.id) ? 'retained' : 'missing')))
    T(`${platform} deleting the MCP web guide blocks every guide-owned capability`, newLosses(afterGuide, beforeGuide).length === guideCapabilities.length - selectorCapabilities.size)
    files[guide] = originalGuide
    const calendarShell = platform === 'web'
      ? 'apps/web/app/(app)/calendar/_components/calendar-shell.tsx'
      : 'apps/mobile/app/(tabs)/calendar/_components/calendar-shell.tsx'
    const originalCalendarShell = files[calendarShell]
    for (const direction of ['next', 'previous']) {
      const ids = [`${platform}:control:common.${direction}Week`]
      if (platform === 'web') ids.push(`web:control:calendar.agenda.${direction}Day`)
      const capabilities = inventory.entries.filter((entry) => ids.includes(entry.id))
      const beforeCalendar = compare(capabilities, scan(current, platform), rules)
      T(`${platform} ${direction} calendar controls retain their real rendered labels`, beforeCalendar.length === ids.length && beforeCalendar.every((entry) => entry.disposition === 'retained' && entry.redesign.length > 0))
      files[calendarShell] = originalCalendarShell.split('\n').filter((line) => !line.includes(`period?.${direction}Label`)).join('\n')
      T(`${platform} mutation removes the ${direction} calendar button`, files[calendarShell] !== originalCalendarShell)
      const afterCalendar = compare(capabilities, scan(current, platform), rules)
      T(`${platform} shared labels cannot retain deleted ${direction} calendar controls`, afterCalendar.every((entry) => entry.disposition === 'missing'))
      T(`${platform} deleting the ${direction} calendar button blocks its mapped capabilities`, newLosses(afterCalendar, beforeCalendar).length === ids.length)
      files[calendarShell] = originalCalendarShell
    }
    const id = `${platform}:control:chat.attachFile`
    const capability = inventory.entries.filter((entry) => entry.id === id)
    const before = compare(capability, scan(current, platform), rules)
    T(`${platform} attachment control is retained before removing its consumer`, before[0]?.disposition === 'retained')
    const composer = 'packages/shared/src/chat/composer-controls.ts'
    const original = files[composer]
    files[composer] = original.split('\n').filter((line) => !line.includes("id: 'file', label: props.attachWords.file") && !line.includes("if (id === 'file') props.onAttachFile?.()")).join('\n')
    T(`${platform} mutation removes the real attachment menu item and selection branch`, files[composer] !== original && !files[composer].includes('props.attachWords.file'))
    const after = compare(capability, scan(current, platform), rules)
    T(`${platform} a surviving word producer cannot retain a deleted attachment control`, after[0]?.disposition === 'missing')
    T(`${platform} deleting the consuming control is a blocking new loss`, newLosses(after, before).some((entry) => entry.id === id))
    files[composer] = original

    const celebration = `apps/${platform}/components/gamification/celebration-panel.tsx`
    const titles = inventory.entries.filter((entry) => [
      `${platform}:control:gamification.levelUp.title`,
      `${platform}:control:goals.completedCelebrationTitle`,
    ].includes(entry.id))
    const beforeCelebration = compare(titles, scan(current, platform), rules)
    T(`${platform} both mapped celebration titles have their actual rendered output`, beforeCelebration.length === 2 && beforeCelebration.every((entry) => entry.disposition === 'retained' && entry.redesign.some((item) => item.file === celebration)))
    const originalCelebration = files[celebration]
    files[celebration] = originalCelebration.split('\n').filter((line) => !line.includes('{line}</p>') && !line.includes('{line}</Text>')).join('\n')
    T(`${platform} mutation deletes only the actual celebration output`, files[celebration] !== originalCelebration && files[celebration].includes('plural(translatedLine, pluralCount)'))
    const accessibleCelebration = compare(titles, scan(current, platform), rules)
    T(`${platform} the remaining accessible final fact retains both celebration titles`, accessibleCelebration.every((entry) => entry.disposition === 'retained'))
    files[celebration] = files[celebration]
      .replace(/ (?:aria-label|accessibilityLabel)=\{label\}/g, '')
      .replace(/<span role="status"[^>]*>\{announcement\}<\/span>/, '')
      .replace(/<Text testID=\{daily \? 'daily-streak-announcement' : 'celebration-announcement'\} accessibilityLiveRegion="polite"\s+style=\{styles\.announcement\}>\{announcement\}<\/Text>/, '')
    T(`${platform} mutation removes the accessible final fact and announcement consumers`, !files[celebration].includes('{announcement}</') && !/(?:aria-label|accessibilityLabel)=\{label\}/.test(files[celebration]) && files[celebration].includes('setAnnouncement(label)'))
    const afterCelebration = compare(titles, scan(current, platform), rules)
    T(`${platform} unrelated plural consumers cannot retain either deleted celebration title`, afterCelebration.every((entry) => entry.disposition === 'missing'))
    T(`${platform} deleting the celebration output blocks both mapped titles`, newLosses(afterCelebration, beforeCelebration).length === 2)
    files[celebration] = originalCelebration
  }
  inventoryRegressions(fixture)
}
