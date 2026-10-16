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

function hasModifier(node, kind) {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === kind))
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
      const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      if (ts.isExpressionStatement(statement)) module.active.add(statement)
      const declarations = ts.isVariableStatement(statement) ? statement.declarationList.declarations
        : ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement) ? [statement] : []
      for (const declaration of declarations) {
        const names = declaration.name ? [...declaration.name.getText(source).matchAll(/[A-Za-z_$][\w$]*/g)].map((match) => match[0]) : []
        for (const name of names) {
          module.declarations.set(name, declaration)
          if (exported) module.exports.set(name, { node: declaration })
        }
        if (isDefault) module.exports.set('default', { node: declaration })
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
    if (!sources.get(path)) sources.set(path, ts.createSourceFile(path, snapshot.read(path), ts.ScriptTarget.Latest, true))
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
  return { roots, reachable, parse, resolveImport, paths: new Set(sources.keys()), nodes: (path) => moduleFor(path).active, hasDefault: (path) => moduleFor(path).exports.has('default') }
}

function bindingSymbols(graph) {
  const program = ts.createProgram([...graph.reachable], { noLib: true, allowJs: true, jsx: ts.JsxEmit.Preserve }, {
    getSourceFile: (path) => graph.paths.has(path.replace(/^\//, '')) ? graph.parse(path.replace(/^\//, '')) : undefined,
    getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '/',
    getCanonicalFileName: (path) => path, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    fileExists: (path) => graph.paths.has(path.replace(/^\//, '')), readFile: () => undefined,
    resolveModuleNames: (names, path) => names.map((name) => {
      const target = graph.resolveImport(path.replace(/^\//, ''), name)
      return target ? { resolvedFileName: target } : undefined
    }),
  })
  const checker = program.getTypeChecker()
  const translationNames = new Map([...graph.reachable].map((path) => [graph.parse(path), translationsIn(graph.parse(path)).names]))
  const declaration = (node) => {
    let symbol = ts.isShorthandPropertyAssignment(node) ? checker.getShorthandAssignmentValueSymbol(node) : checker.getSymbolAtLocation(node)
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
    return symbol?.valueDeclaration
  }
  function callable(node, seen = new Set()) {
    if (!node || seen.has(node)) return null
    seen.add(node)
    if (ts.isFunctionLike(node) && node.body) return node
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return callable(node.expression, seen)
    if (ts.isVariableDeclaration(node)) return callable(node.initializer, seen)
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return callable(declaration(node), seen)
    if (ts.isCallExpression(node) && /^(?:useCallback|memo|forwardRef)$/.test(node.expression.getText())) return callable(node.arguments[0], seen)
    return null
  }
  return { declaration, callable, translationNames }
}

function bindingInputs(graph, symbols) {
  const { declaration, callable } = symbols
  const calls = new Map()
  const sinks = []
  const assignments = new Map()
  const stateWrites = new Map()
  const arrayWrites = new Map()
  function index(node) {
    if (ts.isTypeNode(node)) return
    if (ts.isCallExpression(node) || ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const target = callable(ts.isCallExpression(node) ? node.expression : node.tagName)
      if (target) {
        if (!calls.has(target)) calls.set(target, [])
        calls.get(target).push(node)
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const setter = declaration(node.expression)
        if (setter && ts.isBindingElement(setter) && ts.isArrayBindingPattern(setter.parent) && setter.parent.elements.indexOf(setter) === 1) {
          const state = setter.parent.elements[0]
          if (!stateWrites.has(state)) stateWrites.set(state, [])
          stateWrites.get(state).push(node.arguments[0])
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'push') {
        const target = declaration(node.expression.expression)
        if (target) {
          if (!arrayWrites.has(target)) arrayWrites.set(target, [])
          arrayWrites.get(target).push(...node.arguments)
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      const target = declaration(node.left)
      if (target) {
        if (!assignments.has(target)) assignments.set(target, [])
        assignments.get(target).push(node.right)
      }
    }
    if (ts.isJsxExpression(node) && node.expression) {
      const attribute = ts.isJsxAttribute(node.parent) ? node.parent : null
      const element = attribute ? attribute.parent.parent : ts.isJsxElement(node.parent) ? node.parent.openingElement : null
      if ((!attribute || !/^(?:on[A-Z]|ref$|key$|style$|className$)/.test(attribute.name.getText())) &&
        (!element || !callable(element.tagName))) sinks.push({ node: node.expression, path: [] })
    }
    if (ts.isJsxSpreadAttribute(node) && !callable(node.parent.parent.tagName)) {
      for (const name of ['accessibilityLabel', 'accessibilityHint', 'aria-label', 'title', 'placeholder', 'value', 'alt', 'children']) sinks.push({ node: node.expression, path: [name] })
    }
    ts.forEachChild(node, index)
  }
  for (const path of graph.reachable) for (const node of graph.nodes(path)) index(node)
  const returns = new Map()
  function returned(fn) {
    if (!returns.has(fn)) {
      const result = []
      function visit(node) {
        if (ts.isFunctionLike(node)) return
        if (ts.isReturnStatement(node) && node.expression) result.push(node.expression)
        else ts.forEachChild(node, visit)
      }
      if (ts.isBlock(fn.body)) visit(fn.body)
      else result.push(fn.body)
      returns.set(fn, result)
    }
    return returns.get(fn)
  }
  return { ...symbols, calls, sinks, assignments, stateWrites, arrayWrites, returned }
}

function traceBindingParameter(node, path, next, calls) {
  next(node.initializer)
  const fn = node.parent
  const position = fn.parameters.indexOf(node)
  for (const call of calls.get(fn) ?? []) {
    if (ts.isCallExpression(call)) next(call.arguments[position])
    else if (position === 0 && path.length) {
      for (const attribute of call.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) next(attribute.expression)
        else if (attribute.name.getText() === path[0] && attribute.initializer && ts.isJsxExpression(attribute.initializer)) next(attribute.initializer.expression, path.slice(1))
      }
      if (path[0] === 'children' && ts.isJsxOpeningElement(call) && ts.isJsxElement(call.parent)) {
        for (const child of call.parent.children) if (ts.isJsxExpression(child)) next(child.expression, path.slice(1))
      }
    }
  }
  const call = fn.parent
  if (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && /^(?:map|flatMap|filter|find|some|every)$/.test(call.expression.name.text) && position === 0) next(call.expression.expression, ['*', ...path])
}

function traceBindingCall(node, path, next, inputs) {
  const { callable, returned, translationNames } = inputs
  const fn = callable(node.expression)
  if (fn) returned(fn).forEach((value) => next(value))
  else if (/^(?:useMemo|useCallback|useState)$/.test(node.expression.getText())) {
    const callback = callable(node.arguments[0])
    if (callback) returned(callback).forEach((value) => next(value, node.expression.getText() === 'useState' ? path.slice(1) : path))
    else next(node.arguments[0], node.expression.getText() === 'useState' ? path.slice(1) : path)
  } else if (ts.isPropertyAccessExpression(node.expression) && /^(?:filter|find|slice|sort|concat|replace|trim|charAt)$/.test(node.expression.name.text)) next(node.expression.expression)
  else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') next(node.expression.expression, ['*', ...path])
  else if (ts.isPropertyAccessExpression(node.expression) && /^(?:map|flatMap)$/.test(node.expression.name.text)) {
    const callback = callable(node.arguments[0])
    if (callback) returned(callback).forEach((value) => next(value, path[0] === '*' ? path.slice(1) : path))
  } else if (translationNames.get(node.getSourceFile())?.has(node.expression.getText())) {
    next(node.arguments[0])
    const values = node.arguments[1]
    if (values && ts.isObjectLiteralExpression(values)) for (const property of values.properties) next(ts.isShorthandPropertyAssignment(property) ? property : property.initializer)
  } else next(node.expression)
}

function bindingConsumers(graph, origins) {
  const inputs = bindingInputs(graph, bindingSymbols(graph))
  const { declaration, assignments, stateWrites, arrayWrites, calls, returned, sinks } = inputs
  const consumers = new Map()
  for (const { node: sink, path: sinkPath } of sinks) {
    const seen = new Map()
    function trace(node, path = []) {
      if (!node || path.length > 20) return
      const key = path.join('.')
      if (!seen.has(node)) seen.set(node, new Set())
      if (seen.get(node).has(key)) return
      seen.get(node).add(key)
      if (!path.length && origins.has(node)) {
        const id = origins.get(node)
        if (!consumers.has(id)) consumers.set(id, [])
        const location = evidence(sink.getSourceFile(), sink)
        if (!consumers.get(id).some((item) => item.file === location.file && item.line === location.line)) consumers.get(id).push(location)
      }
      const next = (value, suffix = path) => trace(value, suffix)
      if (ts.isIdentifier(node) || ts.isShorthandPropertyAssignment(node)) next(declaration(node))
      else if (ts.isPropertyAccessExpression(node)) next(node.expression, [node.name.text, ...path])
      else if (ts.isElementAccessExpression(node)) next(node.expression, [ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '*', ...path])
      else if (ts.isVariableDeclaration(node)) {
        next(node.initializer)
        for (const value of assignments.get(node) ?? []) next(value)
        for (const value of arrayWrites.get(node) ?? []) next(value, path[0] === '*' ? path.slice(1) : path)
      } else if (ts.isBindingElement(node)) {
        const pattern = node.parent
        const name = ts.isArrayBindingPattern(pattern) ? String(pattern.elements.indexOf(node)) : (node.propertyName ?? node.name).getText().replace(/^['"]|['"]$/g, '')
        const excluded = node.dotDotDotToken && ts.isObjectBindingPattern(pattern) && pattern.elements.some((item) => !item.dotDotDotToken && (item.propertyName ?? item.name).getText().replace(/^['"]|['"]$/g, '') === path[0])
        if (!excluded) next(pattern.parent, node.dotDotDotToken ? path : [name, ...path])
        for (const value of stateWrites.get(node) ?? []) next(value)
      } else if (ts.isParameter(node)) {
        traceBindingParameter(node, path, next, calls)
      } else if (ts.isObjectLiteralExpression(node) && path.length) {
        for (const property of node.properties) {
          if (ts.isSpreadAssignment(property)) next(property.expression)
          else if (path[0] === '*' || property.name?.getText().replace(/^['"]|['"]$/g, '') === path[0]) next(ts.isShorthandPropertyAssignment(property) ? property : property.initializer, path.slice(1))
        }
      } else if (ts.isArrayLiteralExpression(node)) {
        const suffix = path[0] === '*' || /^\d+$/.test(path[0] ?? '') ? path.slice(1) : path
        for (const item of node.elements) next(ts.isSpreadElement(item) ? item.expression : item, ts.isSpreadElement(item) ? path : suffix)
      } else if (ts.isCallExpression(node)) {
        traceBindingCall(node, path, next, inputs)
      } else if (ts.isConditionalExpression(node)) { next(node.whenTrue); next(node.whenFalse) }
      else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) { next(node.left); next(node.right) }
      else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isAwaitExpression(node)) next(node.expression)
      else if (ts.isTemplateExpression(node)) node.templateSpans.forEach((span) => next(span.expression))
      else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) returned(node).forEach((value) => next(value))
    }
    trace(sink, sinkPath)
  }
  return consumers
}

function translationsIn(source) {
  const names = new Set(['t', 'translate'])
  const bindings = []
  const prefixes = new Set([''])
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer
      if (ts.isCallExpression(call) && /^(?:useTranslations|useTranslation|getTranslations)$/.test(call.expression.getText(source))) {
        const namespace = call.arguments[0] && ts.isStringLiteral(call.arguments[0]) ? call.arguments[0].text : ''
        const identifiers = ts.isIdentifier(node.name) ? [node.name.text] : ts.isObjectBindingPattern(node.name)
          ? node.name.elements.filter((item) => (item.propertyName ?? item.name).getText(source) === 't').map((item) => item.name.getText(source)) : []
        let scope = node.parent
        while (scope.parent && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent
        for (const name of identifiers) { names.add(name); bindings.push({ name, namespace, scope }) }
        prefixes.add(namespace)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return {
    names,
    prefixes: [...prefixes],
    namespace(node, name) {
      const bound = bindings.filter((binding) => binding.name === name && binding.scope.pos <= node.pos && binding.scope.end >= node.end)
        .sort((left, right) => left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos))[0]
      const scoped = [...prefixes].filter(Boolean)
      return bound?.namespace ?? (scoped.length === 1 ? scoped[0] : '')
    },
  }
}

function evidence(source, node) {
  return { file: source.fileName, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }
}

function interaction(node) {
  for (let owner = node.parent; owner; owner = owner.parent) {
    if (ts.isJsxElement(owner) || ts.isJsxSelfClosingElement(owner)) {
      const opening = ts.isJsxElement(owner) ? owner.openingElement : owner
      const attributes = opening.attributes.properties.filter(ts.isJsxAttribute).map((item) => item.name.getText())
      if (attributes.some((name) => /^(?:on(?!Close$|OpenChange$|Dismiss$|Cancel$|RequestClose$|Layout$|ContentSizeChange$)[A-Z]|toggle$|href$)/.test(name))) return true
    }
    if (ts.isPropertyAssignment(owner) && /^(?:label|labelKey|textKey|ariaLabel)$/.test(owner.name.getText())) return true
    if (ts.isBinaryExpression(owner) && /(?:label|Label)$/.test(owner.left.getText())) return true
    if (ts.isVariableDeclaration(owner) && /^(?:label|ariaLabel)$/.test(owner.name.getText())) return true
    if (ts.isFunctionDeclaration(owner) || ts.isArrowFunction(owner)) break
  }
  return false
}

function displayedValue(node) {
  let conditional = false
  for (let owner = node.parent; owner; owner = owner.parent) {
    if (ts.isConditionalExpression(owner)) conditional = true
    if (ts.isJsxElement(owner) || ts.isJsxSelfClosingElement(owner)) {
      const opening = ts.isJsxElement(owner) ? owner.openingElement : owner
      if (conditional || (ts.isCallExpression(node) && node.arguments.length > 1) || opening.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.name.getText() === 'value')) return true
      if (ts.isJsxElement(owner)) {
        return owner.children.some((child) => ts.isJsxExpression(child) && child.expression &&
          !(child.pos <= node.pos && child.end >= node.end) &&
          !ts.isStringLiteral(child.expression) && !(ts.isCallExpression(child.expression) && /^(?:t|translate)$/.test(child.expression.expression.getText())) && child.expression.getText().trim().length > 0)
      }
      return false
    }
    if (ts.isFunctionDeclaration(owner) || ts.isArrowFunction(owner)) return false
  }
  return false
}

export function scan(snapshot, platform) {
  const catalog = flatten(JSON.parse(snapshot.read('packages/shared/src/i18n/en.json')))
  const graph = sourceTree(snapshot, platform)
  const entries = new Map()
  const origins = new Map()
  const add = (kind, key, location) => {
    const id = `${platform}:${kind}:${key}`
    if (!entries.has(id)) entries.set(id, { id, platform, kind, key, label: catalog[key] ?? key, evidence: [] })
    const record = entries.get(id)
    if (!record.evidence.some((item) => item.file === location.file && item.line === location.line)) record.evidence.push(location)
  }
  for (const path of graph.roots.filter((path) => path.startsWith(`apps/${platform}/app/`))) {
    if (/(?:layout|error|not-found)\.tsx$/.test(path) || !graph.hasDefault(path)) continue
    let route = path.slice(`apps/${platform}/app`.length).replace(/\/(?:\([^/]+\)|_components)(?=\/)/g, '').replace(/\/(?:page|index)\.tsx$|\.tsx$/g, '') || '/'
    const source = graph.parse(path)
    const entrypoint = source.statements.find((node) => ts.isExportAssignment(node) || hasModifier(node, ts.SyntaxKind.DefaultKeyword)) ?? source
    add('route', route, evidence(source, entrypoint))
  }
  for (const path of [...graph.reachable].sort()) {
    const source = graph.parse(path)
    const namespaces = translationsIn(source)
    function visit(node) {
      if (ts.isCallExpression(node) && namespaces.names.has(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const literal = node.arguments[0].text
        const namespace = namespaces.namespace(node, node.expression.getText(source))
        const qualified = namespace ? `${namespace}.${literal}` : literal
        const key = catalog[qualified] ? qualified : literal
        if (catalog[key]) {
          add(interaction(node) ? 'control' : displayedValue(node) ? 'display' : 'content', key, evidence(source, node))
          origins.set(node, `${platform}:content:${key}`)
        }
      }
      if (ts.isStringLiteral(node) && catalog[node.text] && ts.isPropertyAssignment(node.parent) && /(?:Key|^label)$/.test(node.parent.name.getText(source))) {
        add(/^(?:labelKey|label|textKey)$/.test(node.parent.name.getText(source)) ? 'control' : 'content', node.text, evidence(source, node))
      }
      if (ts.isStringLiteral(node) && !(ts.isCallExpression(node.parent) && namespaces.names.has(node.parent.expression.getText(source)) && node.parent.arguments[0] === node)) {
        const prefixes = namespaces.prefixes
        for (const prefix of prefixes) {
          const key = prefix ? `${prefix}.${node.text}` : node.text
          if (catalog[key]) { add('content', key, evidence(source, node)); origins.set(node, `${platform}:content:${key}`) }
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
  const consumers = bindingConsumers(graph, origins)
  for (const entry of entries.values()) if (entry.kind === 'content') entry.consumers = consumers.get(entry.id) ?? []
  if (platform === 'mobile') scanWidget(snapshot, add)
  return [...entries.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function scanWidget(snapshot, add) {
  const module = 'apps/mobile/modules/orbit-widget/android/src/main/'
  const manifest = `${module}AndroidManifest.xml`
  if (!snapshot.paths.has(manifest)) return
  const declarations = snapshot.read(manifest)
  if (!declarations.includes('.OrbitWidgetProvider')) return
  const registered = [...declarations.matchAll(/android:name="\.([A-Za-z]\w+)"/g)].map((match) => match[1])
  for (const file of [...snapshot.paths].filter((path) => path.startsWith(module) && registered.some((name) => path.endsWith(`/${name}.kt`))).sort()) {
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
    if (!['mappings', 'removals', 'tickets', 'policies'].includes(section)) throw new Error(`unknown rules section: ${section}`)
  }
  for (const [name, policy] of Object.entries(rules.policies ?? {})) {
    if (!['DESIGN.md', '.claude/specs/orbit-prod-release.md'].includes(policy.citation) || !policy.rule || !read(policy.citation).includes(policy.rule)) throw new Error(`${name}: missing standing removal citation`)
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
    const direct = byId.get(capability.id)
    const candidates = direct ? [direct] : (rule?.targets ?? []).map((id) => byId.get(id)).filter((entry) => entry && (entry.kind !== 'content' || entry.consumers?.length))
    const retained = Boolean(direct) || Boolean(rule?.targets && candidates.length === rule.targets.length)
    if (retained) return { ...capability, disposition: 'retained', redesign: candidates.flatMap((entry) => entry.kind === 'content' ? entry.consumers : entry.evidence) }
    if (removal) return { ...capability, disposition: 'approved-removal', removal }
    return { ...capability, disposition: 'missing', redesign: [], ...(rules.tickets?.[capability.id] ? { ticket: rules.tickets[capability.id] } : {}) }
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
  const inventory = { regenerate: 'git fetch origin main && node tools/check-feature-parity.mjs --write', production: production.revision, standingRemovals: rules.policies, allowedRemovals: rules.removals, translationUses: observations.filter((entry) => entry.kind === 'content'), method: 'Reachable exported symbols, routes, translated controls and option bindings, keyboard handlers and native widget actions and figures. Mapped translation bindings require a reachable rendered consumer, resolved through property-specific values, calls and component props. Noninteractive translation references alone are supporting observations. Static source evidence does not prove runtime conditions, permissions or API behavior.', entries }
  if (options.write) {
    const { entries: rows, translationUses, ...header } = inventory
    const serialize = (entry) => JSON.stringify(entry, (key, value) => ['label', 'consumers'].includes(key) ? undefined : value)
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
