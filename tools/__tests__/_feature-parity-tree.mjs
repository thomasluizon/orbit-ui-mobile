import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { T, REPO_ROOT, root, stage, run } from './_harness.mjs'
import { scan, compare, newLosses } from '../check-feature-parity.mjs'

/**
 * The parity fixtures that check-feature-parity, check-feature-parity-web and check-feature-parity-mobile share.
 * The full-tree cases scan one real platform tree each, so each platform is its own case module and the CI shards can balance them.
 */

export const manifestPath = '.claude/manifests/feature-parity.json'
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
    `${platform}:display:common.selectedDate`,
  ]),
  'web:display:habits.form.suggestTags',
]

/** Stages a production git fixture in `name` under the suite root and generates its inventory with the real CLI. */
export function generatedInventory(catalog, rules, name) {
  const directory = join(root, name)
  const put = (path, source) => stage(`${name}/${path}`, source)
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
  const inventory = JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
  const tracked = execFileSync('git', ['ls-files', manifestPath], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  if (tracked) git(['add', manifestPath])
  git(['commit', '-q', '--allow-empty', '-m', 'Generated inventory policy fixture'])
  return { directory, put, git, generate, generated, tracked, inventory, provenance, source: files['packages/shared/src/parity-controls.tsx'] }
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
  const paths = [...new Set(retained.flatMap((entry) => ['web:control:shell.collapseSidebar', 'web:control:shell.expandSidebar'].includes(entry.id)
    ? ['apps/web/components/shell/shell-wide.tsx']
    : entry.redesign.map((item) => item.file)))]
  const originals = new Map(paths.map((path) => [path, files[path]]))
  for (const path of paths) {
    if (path.endsWith('habit-emoji-selector.tsx')) {
      const button = /<EmojiSuggestionButton\b[^>]*\/>/g
      T(`${platform} the current emoji generation owner is removed exactly once`, [...files[path].matchAll(button)].length === 1)
      files[path] = files[path].replace(button, '{null}')
    }
    else if (path.endsWith('shell-wide.tsx')) files[path] = files[path].replace('label={toggleLabel}', '')
    else if (path.endsWith('mcp-code-client.tsx')) files[path] = files[path].split('\n').filter((line) => !line.includes("t('orbitMcp.configInstructions')") && !line.includes("t('orbitMcp.replaceKey')")).join('\n')
    else if (path.endsWith('profile-api-keys.tsx')) files[path] = files[path].split('\n').filter((line) => !line.includes("t('orbitMcp.created')") && !line.includes("t('orbitMcp.lastUsed')") && !line.includes("apiKey.isReadOnly ? t('orbitMcp.permReadOnly')")).join('\n')
    T(`${platform} the restoration evidence source is deliberately broken`, files[path] !== originals.get(path), path)
  }
  const removed = compare(capabilities, scan(current, platform), rules)
  T(`${platform} closed restoration tickets cannot exempt lost replacements`, newLosses(removed, retained).length === capabilities.length, removed.filter((entry) => entry.disposition !== 'missing').map((entry) => entry.id).join(', '))
  T(`${platform} removing restoration owners retains manual emoji picking and automatic date interpretation`, files[`apps/${platform}/components/habits/habit-form-fields/habit-emoji-selector.tsx`].includes('handleSelectEmoji(emoji)') && Object.values(dateOwners(platform, files, scan(current, platform))).every(Boolean))
  for (const [path, source] of originals) files[path] = source
  T(`${platform} restoring every closed restoration owner leaves no new losses`, newLosses(compare(capabilities, scan(current, platform), rules), retained).length === 0)
}

function dateOwners(platform, files, observations) {
  const owner = `apps/${platform}/components/habits/habit-form-fields/habit-date-field.tsx`
  const source = files[owner]
  const editor = files['packages/shared/src/utils/habit-date-editor.ts']
  return {
    automatic: source.includes('editor.setPhrase(value)') && source.includes('interpretation.mutateAsync({ ...input, signal })') && editor.includes('void this.interpret()'),
    glyph: /trailing=\{snapshot.pending \|\| snapshot.astra \? .*<OrbitMascot /.test(source) && ['dateInterpreting', 'dateInterpreted'].every((key) => observations.some((entry) => entry.key === `habits.form.${key}` && entry.consumers?.some((item) => item.file === owner))),
    resolved: /<DateField\b[^>]* value=\{date\}/.test(source) && editor.includes("if (result === 'proposed') this.applyInterpretation()"),
  }
}

function automaticDateRegressions(platform, current, files, rules, dateCapabilities) {
  const owner = `apps/${platform}/components/habits/habit-form-fields/habit-date-field.tsx`
  const editor = 'packages/shared/src/utils/habit-date-editor.ts'
  const observations = scan(current, platform, rules)
  const before = compare(dateCapabilities, observations, rules)
  T(`${platform} automatic date interpretation, inline attribution and resolved picker have real owners`, Object.values(dateOwners(platform, files, observations)).every(Boolean))
  const mutations = [
    ['automatic', owner, 'interpretation.mutateAsync({ ...input, signal })', 'Promise.resolve(null)'],
    ['glyph', owner, / trailing=\{snapshot.pending \|\| snapshot.astra \? .*? : undefined\}/g, ''],
    ['resolved', owner, 'value={date}', 'value=""'],
    ['resolved', editor, "if (result === 'proposed') this.applyInterpretation()", "if (result === 'proposed') return"],
  ]
  for (const [name, path, pattern, replacement] of mutations) {
    const original = files[path]
    files[path] = original.replace(pattern, replacement)
    T(`${platform} ${name} mutation removes the real date owner`, files[path] !== original)
    const after = scan(current, platform, rules)
    const owners = dateOwners(platform, files, after)
    T(`${platform} deleting ${name} fails its date obligation and retains the other owners`, !owners[name] && Object.entries(owners).filter(([key]) => key !== name).every(([, present]) => present))
    T(`${platform} deleting ${name} retains manual date selection and picker readback`, files[owner].includes('editor.selectDate(value)') && newLosses(compare(dateCapabilities, after, rules), before).length === 0)
    files[path] = original
  }
  T(`${platform} restoring date owners retains automatic interpretation, attribution and resolved date`, Object.values(dateOwners(platform, files, scan(current, platform, rules))).every(Boolean))
}

function invocationRuleRegressions(platform, current, files, inventory, rules, observations) {
  const ids = formRuleIds.filter((id) => id.startsWith(`${platform}:`) && !id.includes('common.selectedDate'))
  const capabilities = inventory.entries.filter((entry) => ids.includes(entry.id))
  const before = compare(capabilities, observations, rules)
  T(`${platform} current form invocation owners retain every original obligation`, before.length === ids.length && before.every((entry) => entry.disposition === 'retained' && entry.redesign.length > 0))
  const prefix = `apps/${platform}/components/habits/`
  const mutations = [
    ['tag generation', `${prefix}habit-form-fields/tag-suggestions.tsx`, /<PillButton minimumHeight=\{48\}[\s\S]*?<\/PillButton>/g, [`${platform}:control:habits.form.suggestTags`]],
    ['reschedule retry', `${prefix}reschedule-sheet.tsx`, /<PillButton leadingIcon=\{<OrbitMascot size=\{16\} \/>\} variant=\{filledVariant\} size="sm" onClick=\{\(\) => void refetch\(\)\}>\s*\{t\('habits.reschedule.suggestDate'\)\}\s*<\/PillButton>/g, [`${platform}:control:habits.reschedule.retry`]],
    ['reschedule menu', `${prefix}habit-row.tsx`, /^.*items\.push\(\{ id: 'reschedule',.*\n/gm, [`${platform}:control:habits.actions.reschedule`]],
  ]
  for (const [name, path, pattern, missingIds] of mutations) {
    const original = files[path]
    T(`${platform} ${name} mutation matches exactly one current owner`, [...original.matchAll(pattern)].length === 1)
    files[path] = original.replace(pattern, '')
    const afterObservations = scan(current, platform, rules)
    const after = compare(capabilities, afterObservations, rules)
    const losses = newLosses(after, before).map((entry) => entry.id).sort()
    T(`${platform} deleting ${name} blocks exactly its original obligations`, JSON.stringify(losses) === JSON.stringify([...missingIds].sort()), losses.join(', '))
    T(`${platform} deleting ${name} retains automatic dates, emoji generation and manual tag picking`, Object.values(dateOwners(platform, files, afterObservations)).every(Boolean) && afterObservations.some((entry) => entry.id === `${platform}:control:habits.form.suggestEmoji` && entry.evidence.some((item) => item.file.endsWith('habit-emoji-selector.tsx'))) && afterObservations.some((entry) => entry.id === `${platform}:control:habits.form.tags`))
    T(`${platform} deleting ${name} preserves deterministic acceptance, recovery and other row actions`, files[`${prefix}habit-form-fields/tag-suggestions.tsx`].includes('suggestions.acceptSuggestion(suggestion)') && files[`${prefix}habit-form-fields/tag-suggestions.tsx`].includes('getFriendlyErrorMessage') && files[`${prefix}reschedule-sheet.tsx`].includes("t('habits.reschedule.dismiss')") && files[`${prefix}reschedule-sheet.tsx`].includes("t('habits.reschedule.accept')") && ['edit', 'skip', 'drill'].every((key) => files[`${prefix}habit-row.tsx`].includes(`id: '${key}'`)))
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
    T(`${platform} removing ${key} blocks its pending obligation while retaining generation`, newLosses(compare(pending, after, rules), pendingBefore).length === 1 && after.some((entry) => entry.id === `${platform}:control:habits.form.${key === 'emojiSuggesting' ? 'suggestEmoji' : 'suggestTags'}` && entry.evidence.some((item) => item.file === path)))
    if (platform === 'web' && key === 'suggestingTags') T('web the named tag status region survives independently of its pending hint', compare(capabilities, after, rules).some((entry) => entry.id === 'web:display:habits.form.suggestTags' && entry.disposition === 'retained' && entry.redesign.some((item) => item.file === path)) && newLosses(compare(capabilities, after, rules), before).length === 0)
    files[path] = original
    T(`${platform} restoring ${key} leaves no pending or invocation losses`, newLosses(compare([...capabilities, ...pending], scan(current, platform, rules), rules), [...before, ...pendingBefore]).length === 0)
  }
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

/** Scans the real tree of one platform, then mutates its owners and asserts that each loss blocks. */
export function fullTreeCases(platform) {
  const catalog = readFileSync(join(REPO_ROOT, 'packages/shared/src/i18n/en.json'), 'utf8')
  const rules = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/feature-parity-rules.json'), 'utf8'))
  const fixture = generatedInventory(catalog, rules, `parity-source-${platform}`)
  T(`${platform} the full-tree cases generate their inventory fixture`, fixture.generated.status === 0, fixture.generated.stderr)
  const { inventory } = fixture
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
  automaticDateRegressions(platform, current, files, rules, [...dateCapabilities, ...selectedDate])
  T(`${platform} restoring date owners leaves no selection or readback losses`, newLosses(compare([...dateCapabilities, ...selectedDate], scan(current, platform, rules), rules), [...beforeDate, ...beforeReadback]).length === 0)
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
