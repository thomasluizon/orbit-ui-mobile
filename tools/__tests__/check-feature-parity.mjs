import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { T, REPO_ROOT } from './_harness.mjs'
import { scan, compare, validateRules, newLosses } from '../check-feature-parity.mjs'

export const cases = () => {
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
  const inventory = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/manifests/feature-parity.json'), 'utf8'))
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
    const id = `${platform}:control:chat.attachFile`
    const capability = inventory.entries.filter((entry) => entry.id === id)
    const before = compare(capability, scan(current, platform), rules)
    T(`${platform} attachment control is retained before removing its consumer`, before[0]?.disposition === 'retained')
    const composer = `apps/${platform}/components/shell/composer.tsx`
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
    const afterCelebration = compare(titles, scan(current, platform), rules)
    T(`${platform} unrelated plural consumers cannot retain either deleted celebration title`, afterCelebration.every((entry) => entry.disposition === 'missing'))
    T(`${platform} deleting the celebration output blocks both mapped titles`, newLosses(afterCelebration, beforeCelebration).length === 2)
    files[celebration] = originalCelebration
  }

}
