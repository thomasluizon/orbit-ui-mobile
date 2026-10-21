import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

import { T, REPO_ROOT, root, stage, run } from './_harness.mjs'
import { scan, compare, validateRules, newLosses } from '../check-feature-parity.mjs'

const manifestPath = '.claude/manifests/feature-parity.json'

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
    ids.push(...['common.nextWeek', 'common.previousWeek', 'chat.attachFile', 'gamification.levelUp.title', 'goals.completedCelebrationTitle'].map((key) => `${platform}:control:${key}`))
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
  mkdirSync(join(directory, '.claude/manifests'), { recursive: true })
  const generate = (extra = []) => run('check-feature-parity.mjs', ['--root', directory, '--production', 'production', '--write', ...extra])
  const generated = generate(['--ci', '--base', 'production'])
  T('the CLI generates a temporary inventory from source without a recorded manifest', generated.status === 0, generated.stderr)
  const inventory = JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
  const tracked = execFileSync('git', ['ls-files', manifestPath], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  T('the generated parity inventory is not tracked', tracked === '')
  if (tracked) git(['add', manifestPath])
  git(['commit', '-q', '--allow-empty', '-m', 'Generated inventory policy fixture'])
  return { directory, put, git, generate, inventory, source: files['packages/shared/src/parity-controls.tsx'] }
}

function inventoryRegressions(fixture) {
  const { directory, put, git, generate, source } = fixture
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
  put('tools/feature-parity-rules.json', JSON.stringify({ tickets: { 'web:control:habits.viewAll': '#1423', 'mobile:control:habits.viewAll': '#1423' } }))
  T('a restoration ticket cannot exempt a new source loss', generate(['--ci', '--base', base]).status === 1)
  git(['add', controls, 'tools/feature-parity-rules.json'])
  git(['commit', '-q', '-m', 'Ticketed source debt fixture'])
  T('ticketed base losses remain advisory without a committed manifest', generate(['--ci', '--base', 'HEAD']).status === 0)
  put('tools/feature-parity-rules.json', '{}')
  T('an unticketed base loss still blocks', generate(['--ci', '--base', 'HEAD']).status === 1)
  put(controls, source)
  rmSync(join(directory, '.claude/manifests'), { recursive: true })
  const fresh = generate(['--ci', '--base', base])
  T('writing the inventory creates its output directory', fresh.status === 0, fresh.stderr)
}

export const cases = () => {
  const workflow = yaml.load(readFileSync(join(REPO_ROOT, '.github/workflows/guards.yml'), 'utf8'))
  const artifact = workflow.jobs.guards.steps.find((step) => step.id === 'feature-parity__2')
  T('Guards uploads the generated inventory from its hidden directory', artifact.with.path === manifestPath && artifact.with['include-hidden-files'] === true)
  const catalog = readFileSync(join(REPO_ROOT, 'packages/shared/src/i18n/en.json'), 'utf8')
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
