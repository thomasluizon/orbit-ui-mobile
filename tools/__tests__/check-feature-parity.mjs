import { readFileSync } from 'node:fs'
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

}
