#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INVENTORY = '.claude/manifests/feature-parity.json'
const RULES = 'tools/feature-parity-rules.json'
const USAGE = `usage: check-feature-parity.mjs [--root <directory>] [--production <ref>] [--base <ref>] [--write] [--ci]

Derives production capabilities from reachable routes, translation uses, option values,
and keyboard handlers on web and Android. Resolves redesign evidence from source, never
from a recorded completion status. Writes the generated inventory only with --write.

  --root <directory>  repository (default: script's repository)
  --production <ref>  production tree (default: origin/main; fetch it first)
  --base <ref>        compare existing redesign debt with this tree in --ci mode
  --write             regenerate .claude/manifests/feature-parity.json
  --ci                report ticketed base debt as advisory; reject new losses
  --help, -h          print usage and exit 0

No stdin. Exit codes: 0 retained or ticketed base debt in CI, 1 missing capability,
2 usage, invalid rules, or source read failure. --write alone returns 0 after generation.`

function argumentsFor(argv) {
  const options = { root: ROOT, production: 'origin/main', base: null, write: false, ci: false }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === '--write') options.write = true
    else if (flag === '--ci') options.ci = true
    else if (['--root', '--production', '--base'].includes(flag) && argv[index + 1] && !argv[index + 1].startsWith('-')) {
      options[flag.slice(2)] = argv[++index]
    } else throw new Error(`unknown or incomplete argument: ${flag}`)
  }
  if (options.ci && !options.base) throw new Error('--ci requires --base')
  options.root = resolve(options.root)
  return options
}

function tree(root, ref) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const paths = new Set(git(ref ? ['ls-tree', '-r', '--name-only', ref] : ['ls-files']).trim().split('\n'))
  const cache = new Map()
  if (ref) {
    const requested = [...paths].filter((path) => /^(?:apps\/(?:web|mobile)\/|packages\/shared\/src\/)/.test(path) && /\.(?:[jt]sx?|json|kt|xml)$/.test(path) && !/(?:__tests__|test-support|\.test\.|\.spec\.)/.test(path))
    const contents = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: requested.map((path) => `${ref}:${path}\n`).join(''), maxBuffer: 64 * 1024 * 1024 })
    let offset = 0
    for (const path of requested) {
      const end = contents.indexOf(10, offset)
      const header = contents.subarray(offset, end).toString('utf8')
      const match = /^[a-f0-9]+ blob (\d+)$/.exec(header)
      if (!match) throw new Error(`git cat-file returned an invalid blob header for ${path}`)
      const size = Number(match[1])
      cache.set(path, contents.subarray(end + 1, end + 1 + size).toString('utf8'))
      offset = end + size + 2
    }
  }
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, ref ? git(['show', `${ref}:${path}`]) : readFileSync(resolve(root, path), 'utf8'))
    return cache.get(path)
  }
  return { paths, read, root, revision: ref ? git(['rev-parse', ref]).trim() : 'working-tree' }
}

function flatten(catalog, prefix = '', result = {}) {
  for (const [name, value] of Object.entries(catalog)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (typeof value === 'string') result[key] = value
    else flatten(value, key, result)
  }
  return result
}

function parseModule(source, resolveSpecifier) {
const module = { declarations: new Map(), imports: new Map(), exports: new Map(), stars: [], sideEffects: [], active: new Set(), requested: new Set() }
for (const statement of source.statements) {
  if (ts.isImportDeclaration(statement)) {
    const target = resolveSpecifier(statement.moduleSpecifier.text)
    if (!target || statement.importClause?.isTypeOnly) continue
    const clause = statement.importClause
    if (!clause) module.sideEffects.push(target)
    if (clause?.name) module.imports.set(clause.name.text, { target, name: 'default' })
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const item of clause.namedBindings.elements) {
        if (!item.isTypeOnly) module.imports.set(item.name.text, { target, name: (item.propertyName ?? item.name).text })
      }
    } else if (clause?.namedBindings) module.imports.set(clause.namedBindings.name.text, { target, name: '*' })
  } else if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly) continue
    const target = statement.moduleSpecifier ? resolveSpecifier(statement.moduleSpecifier.text) : null
    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const item of statement.exportClause.elements) {
        if (!item.isTypeOnly) module.exports.set(item.name.text, { target, name: (item.propertyName ?? item.name).text })
      }
    } else if (target) module.stars.push(target)
  } else if (ts.isExportAssignment(statement)) {
    module.exports.set('default', { node: statement.expression })
  } else {
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    const isDefault = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    const declarations = ts.isVariableStatement(statement) ? statement.declarationList.declarations : [statement]
    for (const declaration of declarations) {
      if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) continue
      const names = declaration.name ? [...declaration.name.getText(source).matchAll(/[A-Za-z_$][\w$]*/g)].map((match) => match[0]) : []
      for (const name of names) {
        module.declarations.set(name, declaration)
        if (exported) module.exports.set(name, { node: declaration })
      }
      if (isDefault) module.exports.set('default', { node: declaration })
      if (ts.isExpressionStatement(declaration)) module.active.add(declaration)
    }
  }
}
return module
}

function sourceTree(snapshot, platform) {
  const prefix = `apps/${platform}/`
  const sources = new Map()
  for (const path of [...snapshot.paths].sort()) {
    if (!/\.[jt]sx?$/.test(path) || /(?:__tests__|test-support|\/e2e\/|\.test\.|\.spec\.|\.d\.ts$)/.test(path)) continue
    if (!path.startsWith(prefix) && !path.startsWith('packages/shared/src/')) continue
    sources.set(path, null)
  }
  const parse = (path) => {
    if (!sources.get(path)) sources.set(path, ts.createSourceFile(path, snapshot.read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
    return sources.get(path)
  }
  const roots = [...sources.keys()].filter((path) => {
    if (!path.startsWith(`${prefix}app/`)) return false
    if (platform === 'web') return /\/(?:page|layout|error|global-error|not-found)\.tsx$/.test(path)
    if (/\/(?:_layout|\+not-found)\.tsx$/.test(path)) return true
    return /\bexport\s+default\b/.test(snapshot.read(path))
  })
  if (platform === 'mobile' && sources.has('apps/mobile/index.js')) roots.push('apps/mobile/index.js')
  const reachable = new Set()
  const modules = new Map()
  function resolveImport(path, specifier) {
    let target
    if (specifier.startsWith('.')) target = posix.join(posix.dirname(path), specifier)
    else if (specifier.startsWith('@/')) target = `${prefix}${specifier.slice(2)}`
    else if (specifier.startsWith('@orbit/shared/')) target = `packages/shared/src/${specifier.slice('@orbit/shared/'.length)}`
    if (!target) return null
    return [target, ...['.tsx', '.ts', '.js', '/index.tsx', '/index.ts'].map((ending) => target + ending)].find((candidate) => sources.has(candidate))
  }
  function moduleFor(path) {
    if (modules.has(path)) return modules.get(path)
    const module = parseModule(parse(path), (specifier) => resolveImport(path, specifier))
    modules.set(path, module)
    return module
  }
  function hasExport(path, name, seen = new Set()) {
    if (seen.has(path)) return false
    seen.add(path)
    const module = moduleFor(path)
    return module.exports.has(name) || module.stars.some((target) => hasExport(target, name, seen))
  }
  function visit(path, names) {
    const module = moduleFor(path)
    const first = !reachable.has(path)
    reachable.add(path)
    function include(node) {
      if (module.active.has(node)) return
      module.active.add(node)
      function references(child) {
        if (ts.isTypeNode(child)) return
        if (ts.isIdentifier(child)) {
          if (module.declarations.has(child.text)) include(module.declarations.get(child.text))
          const imported = module.imports.get(child.text)
          if (imported) visit(imported.target, [imported.name])
        }
        if (ts.isCallExpression(child) && child.expression.kind === ts.SyntaxKind.ImportKeyword && child.arguments[0] && ts.isStringLiteral(child.arguments[0])) {
          const target = resolveImport(path, child.arguments[0].text)
          if (target) visit(target, ['*'])
        }
        ts.forEachChild(child, references)
      }
      references(node)
    }
    if (first) {
      module.sideEffects.forEach((target) => visit(target, ['*']))
      for (const node of [...module.active]) { module.active.delete(node); include(node) }
    }
    for (const name of names) {
      if (module.requested.has(name)) continue
      module.requested.add(name)
      if (name === '*') {
        visit(path, [...module.exports.keys()])
        module.stars.forEach((target) => visit(target, ['*']))
        continue
      }
      const exported = module.exports.get(name)
      if (exported?.node) include(exported.node)
      else if (exported?.target) visit(exported.target, [exported.name])
      else if (exported && module.declarations.has(exported.name)) include(module.declarations.get(exported.name))
      else if (exported && module.imports.has(exported.name)) {
        const imported = module.imports.get(exported.name)
        visit(imported.target, [imported.name])
      } else {
        for (const target of module.stars) if (hasExport(target, name)) visit(target, [name])
      }
    }
  }
  roots.forEach((path) => visit(path, ['default']))
  return { roots, reachable, parse, nodes: (path) => moduleFor(path).active }
}

function translationsIn(source) {
  const namespaces = new Map([['t', ''], ['translate', '']])
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer
      if (/^(?:useTranslations|useTranslation|getTranslations)$/.test(call.expression.getText(source))) {
        const namespace = call.arguments[0] && ts.isStringLiteral(call.arguments[0]) ? call.arguments[0].text : ''
        if (ts.isIdentifier(node.name)) namespaces.set(node.name.text, namespace)
        else if (ts.isObjectBindingPattern(node.name)) {
          for (const item of node.name.elements) if ((item.propertyName ?? item.name).getText(source) === 't') namespaces.set(item.name.getText(source), namespace)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return namespaces
}

function evidence(source, node) {
  return { file: source.fileName, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }
}

function interaction(node) {
  for (let owner = node.parent; owner; owner = owner.parent) {
    if (ts.isJsxElement(owner) || ts.isJsxSelfClosingElement(owner)) {
      const opening = ts.isJsxElement(owner) ? owner.openingElement : owner
      const attributes = opening.attributes.properties.map((item) => item.name?.getText() ?? '')
      if (attributes.some((name) => /^(?:on(?!Close$|OpenChange$|Dismiss$|Cancel$|RequestClose$|Layout$|ContentSizeChange$)[A-Z]|toggle$|href$)/.test(name))) return true
    }
    if (ts.isPropertyAssignment(owner) && /^(?:label|labelKey|textKey|ariaLabel)$/.test(owner.name.getText())) return true
    if (ts.isBinaryExpression(owner) && /(?:label|Label)$/.test(owner.left.getText())) return true
    if (ts.isVariableDeclaration(owner) && /^(?:label|ariaLabel)$/.test(owner.name.getText())) return true
    if (ts.isFunctionDeclaration(owner) || ts.isArrowFunction(owner)) break
  }
  return false
}

export function scan(snapshot, platform) {
  const catalog = flatten(JSON.parse(snapshot.read('packages/shared/src/i18n/en.json')))
  const graph = sourceTree(snapshot, platform)
  const entries = new Map()
  const add = (kind, key, location) => {
    const id = `${platform}:${kind}:${key}`
    if (!entries.has(id)) entries.set(id, { id, platform, kind, key, label: catalog[key] ?? key, evidence: [] })
    const record = entries.get(id)
    if (!record.evidence.some((item) => item.file === location.file && item.line === location.line)) record.evidence.push(location)
  }
  for (const path of graph.roots.filter((path) => path.startsWith(`apps/${platform}/app/`))) {
    if (/(?:layout|error|not-found)\.tsx$/.test(path)) continue
    let route = path.slice(`apps/${platform}/app`.length).replace(/\/(?:\([^/]+\)|_components)(?=\/)/g, '').replace(/\/(?:page|index)\.tsx$|\.tsx$/g, '') || '/'
    add('route', route, { file: path, line: 1 })
  }
  for (const path of [...graph.reachable].sort()) {
    const source = graph.parse(path)
    const namespaces = translationsIn(source)
    function visit(node) {
      if (ts.isCallExpression(node) && namespaces.has(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const literal = node.arguments[0].text
        const namespace = namespaces.get(node.expression.getText(source))
        const key = namespace ? `${namespace}.${literal}` : literal
        if (catalog[key]) add(interaction(node) ? 'control' : 'content', key, evidence(source, node))
      }
      if (ts.isStringLiteral(node) && catalog[node.text] && ts.isPropertyAssignment(node.parent) && /(?:Key|^label)$/.test(node.parent.name.getText(source))) {
        add(/^(?:labelKey|label|textKey)$/.test(node.parent.name.getText(source)) ? 'control' : 'content', node.text, evidence(source, node))
      }
      if (ts.isStringLiteral(node)) {
        const prefixes = ['', ...new Set(namespaces.values())].filter((value, index, all) => all.indexOf(value) === index)
        for (const prefix of prefixes) {
          const key = prefix ? `${prefix}.${node.text}` : node.text
          if (catalog[key]) add('content', key, evidence(source, node))
        }
      }
      if (/keyboard-shortcuts/.test(path)) {
        if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) add('shortcut', `g ${node.expression.text}`, evidence(source, node))
        if (ts.isStringLiteral(node) && ts.isBinaryExpression(node.parent) && /(?:event|e)\.key/.test(node.parent.getText(source))) add('shortcut', node.text.toLowerCase(), evidence(source, node))
      }
      ts.forEachChild(node, visit)
    }
    for (const node of graph.nodes(path)) visit(node)
  }
  if (platform === 'mobile') scanWidget(snapshot, add)
  return [...entries.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function scanWidget(snapshot, add) {
  const module = 'apps/mobile/modules/orbit-widget/android/src/main/'
  const manifest = `${module}AndroidManifest.xml`
  if (!snapshot.paths.has(manifest)) return
  if (!snapshot.read(manifest).includes('.OrbitWidgetProvider')) return
  for (const file of [...snapshot.paths].filter((path) => path.startsWith(module) && path.endsWith('.kt')).sort()) {
    const source = snapshot.read(file)
    const location = (offset) => ({ file, line: source.slice(0, offset).split('\n').length })
    const calls = /\.set(?:OnClickPendingIntent|OnClickFillInIntent|PendingIntentTemplate|TextViewText)\(\s*R\.id\.(\w+)/g
    for (const match of source.matchAll(calls)) {
      add(match[0].includes('TextViewText') ? 'native-display' : 'native-control', `widget.${match[1]}`, location(match.index))
    }
    if (/setOnClickPendingIntent\(target,/.test(source)) {
      const targets = /(?:val|var)\s+OPEN_APP_TARGETS\s*=\s*(?:intArrayOf|listOf)\(([\s\S]*?)\)/.exec(source)
      if (targets) for (const match of targets[1].matchAll(/R\.id\.(\w+)/g)) add('native-control', `widget.${match[1]}`, location(targets.index + targets[0].indexOf(targets[1]) + match.index))
    }
  }
}

export function validateRules(capabilities, rules, read) {
  const ids = new Set(capabilities.map((entry) => entry.id))
  for (const section of Object.keys(rules)) {
    if (!['mappings', 'removals', 'tickets'].includes(section)) throw new Error(`unknown rules section: ${section}`)
  }
  for (const section of ['mappings', 'removals', 'tickets']) {
    for (const [id, rule] of Object.entries(rules[section] ?? {})) {
      if (!ids.has(id)) throw new Error(`${section}: no production capability ${id}`)
      if (section === 'tickets') {
        if (!/^#[1-9]\d*$/.test(rule)) throw new Error(`${id}: expected a ticket reference`)
        continue
      }
      if (typeof rule.reason !== 'string' || !rule.reason.trim()) throw new Error(`${id}: missing rule rationale`)
      if (section === 'mappings') {
        if (!Array.isArray(rule.targets) || rule.targets.length === 0 || rule.targets.some((target) => typeof target !== 'string' || !target.startsWith(`${id.split(':')[0]}:`))) throw new Error(`${id}: mapping targets must stay on the same platform`)
      } else {
        if (rules.mappings?.[id] || rules.tickets?.[id]) throw new Error(`${id}: a removal cannot also be mapped or ticketed`)
        if (!['DESIGN.md', '.claude/specs/orbit-prod-release.md'].includes(rule.citation) || typeof rule.rule !== 'string' || !rule.rule.trim() || !read(rule.citation).includes(rule.rule)) throw new Error(`${id}: removal requires a verifiable owner rule citation`)
      }
    }
  }
}

export function newLosses(entries, baseEntries) {
  const debt = new Set(baseEntries.filter((entry) => entry.disposition === 'missing' && entry.ticket).map((entry) => entry.id))
  return entries.filter((entry) => entry.disposition === 'missing' && !debt.has(entry.id))
}

export function compare(production, redesign, rules) {
  const byId = new Map(redesign.map((entry) => [entry.id, entry]))
  return production.map((capability) => {
    const rule = rules.mappings?.[capability.id]
    const removal = rules.removals?.[capability.id]
    if (removal) return { ...capability, disposition: 'approved-removal', removal }
    const candidates = rule?.targets
      ? rule.targets.map((id) => byId.get(id)).filter(Boolean)
      : redesign.filter((entry) => entry.platform === capability.platform && (entry.kind === capability.kind || capability.kind === 'content') && entry.key === capability.key)
    const retained = rule?.targets ? candidates.length === rule.targets.length : candidates.length > 0
    return { ...capability, disposition: retained ? 'retained' : 'missing', redesign: retained ? candidates.flatMap((entry) => entry.evidence) : [], ...(rules.tickets?.[capability.id] ? { ticket: rules.tickets[capability.id] } : {}) }
  })
}

function run(options) {
  const rules = JSON.parse(readFileSync(resolve(options.root, RULES), 'utf8'))
  const production = tree(options.root, options.production)
  const current = tree(options.root, null)
  current.root = options.root
  const observations = ['web', 'mobile'].flatMap((platform) => scan(production, platform))
  const capabilities = observations.filter((entry) => entry.kind !== 'content')
  const redesign = ['web', 'mobile'].flatMap((platform) => scan(current, platform))
  validateRules(capabilities, rules, current.read)
  const entries = compare(capabilities, redesign, rules)
  const inventory = { regenerate: 'git fetch origin main && node tools/check-feature-parity.mjs --write', production: production.revision, translationUses: observations.filter((entry) => entry.kind === 'content'), method: 'Reachable exported symbols, routes, translated controls and option bindings, keyboard handlers and native widget actions and figures. Noninteractive translation references are supporting observations. Static source evidence does not prove runtime conditions, permissions or API behavior.', entries }
  if (options.write) {
    const { entries: rows, translationUses, ...header } = inventory
    const serialize = (entry) => JSON.stringify(entry, (key, value) => key === 'label' ? undefined : value)
    writeFileSync(resolve(options.root, INVENTORY), `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "translationUses": [\n${translationUses.map((entry) => `    ${serialize(entry)}`).join(',\n')}\n  ],\n  "entries": [\n${rows.map((entry) => `    ${serialize(entry)}`).join(',\n')}\n  ]\n}\n`)
  }
  const missing = entries.filter((entry) => entry.disposition === 'missing')
  console.log(`Feature parity: ${entries.length} capabilities; ${entries.filter((entry) => entry.disposition === 'retained').length} retained; ${entries.filter((entry) => entry.disposition === 'approved-removal').length} approved removals; ${missing.length} missing.`)
  console.log(`Outstanding tickets: ${[...new Set(missing.map((entry) => entry.ticket ?? 'ticket required'))].sort().join(', ') || 'none'}`)
  for (const entry of missing) console.log(`${entry.id} | ${entry.evidence.map((item) => `${item.file}:${item.line}`).join(', ')} | ${entry.ticket ?? 'ticket required'}`)
  if (options.ci) {
    const base = tree(options.root, options.base)
    const baseEntries = compare(capabilities, ['web', 'mobile'].flatMap((platform) => scan(base, platform)), rules)
    const losses = newLosses(entries, baseEntries)
    console.log(`Feature parity CI: ${missing.length - losses.length} ticketed base gaps advisory; ${losses.length} new or unticketed losses blocking.`)
    return losses.length ? 1 : 0
  }
  return options.write ? 0 : missing.length ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE)
  } else {
    try { process.exitCode = run(argumentsFor(process.argv.slice(2))) }
    catch (error) { console.error(`check-feature-parity: ${error.message}`); process.exitCode = 2 }
  }
}
