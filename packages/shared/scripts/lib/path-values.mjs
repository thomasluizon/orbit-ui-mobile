import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, posix, resolve } from 'node:path'

/** Vitest transforms an ESM import of `typescript`, which slows the parser about 2.5 times. Node loads it as is. */
export const ts = createRequire(import.meta.url)('typescript')
const pathModules = new Set(['node:path', 'path'])
const urlModules = new Set(['node:url', 'url'])
const pathCalls = new Set(['resolve', 'join', 'dirname'])
const moduleCalls = new Set(['require', 'vi.mock', 'vi.doMock', 'vi.importActual'])
const runCall = /(?:^|\.)(?:exec|execFile|spawn|fork)(?:Sync)?$/
const iterationMethods = new Set(['map', 'flatMap', 'forEach', 'filter', 'some', 'every', 'find', 'findIndex'])
/**
 * An ESLint RuleTester `filename`, an `exemptFiles` rule option and a config lookup name a file only to match the
 * linted filename. ESLint lints the inline code and does not read that file.
 */
const virtualFilenameKeys = new Set(['filename', 'exemptFiles'])
const virtualFilenameCalls = new Set(['calculateConfigForFile', 'eslint.calculateConfigForFile'])
const unknownValue = [{ prefix: '' }]
const valueLimit = 200

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (/\.[cm]?ts$/.test(file)) return ts.ScriptKind.TS
  return file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS
}

function unique(values) {
  const found = new Map(values.map((value) => [JSON.stringify(value), value]))
  return found.size > valueLimit ? unknownValue : [...found.values()]
}

function product(lists, combine) {
  let combinations = [[]]
  for (const list of lists) {
    combinations = combinations.flatMap((parts) => list.map((value) => [...parts, value]))
    if (combinations.length > valueLimit) return unknownValue
  }
  return unique(combinations.map(combine))
}

/** Joins text values. The result is `{ prefix }` from the first part that only the run knows. */
function concatenate(parts) {
  let text = ''
  for (const part of parts) {
    const known = part.url ?? part.path
    if (known === undefined) {
      const prefix = text + part.prefix
      return prefix.includes('?') ? { path: prefix.slice(0, prefix.indexOf('?')) } : { prefix }
    }
    text += known
  }
  return { path: text }
}

/** The dotted name of a callee such as `vi.mock` or `process.cwd`, read from the tree without the source text. */
function dottedName(node) {
  if (ts.isIdentifier(node)) return node.text
  if (!ts.isPropertyAccessExpression(node)) return undefined
  const owner = dottedName(node.expression)
  return owner === undefined ? undefined : `${owner}.${node.name.text}`
}

const propertyKey = (name) => name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ? name.text : undefined

function bind(context, from, local, imported) {
  if (pathModules.has(from)) context.pathFunctions.set(local, ['default', 'posix'].includes(imported) ? 'module' : imported)
  if (urlModules.has(from) && imported === 'fileURLToPath') context.urlFunctions.add(local)
  if (/repository-root(?:\.ts)?$/.test(from) && imported === 'repositoryRoot') context.repositoryRoots.add(local)
}

function bindImport(context, node) {
  const from = node.moduleSpecifier.text
  const clause = node.importClause
  if (clause?.name) bind(context, from, clause.name.text, 'default')
  const bindings = clause?.namedBindings
  if (bindings && ts.isNamespaceImport(bindings)) bind(context, from, bindings.name.text, 'default')
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) bind(context, from, element.name.text, (element.propertyName ?? element.name).text)
  }
  return from
}

function bindRequire(context, node) {
  const call = node.initializer
  if (!call || !ts.isCallExpression(call) || dottedName(call.expression) !== 'require' ||
    !call.arguments[0] || !ts.isStringLiteralLike(call.arguments[0])) return
  const from = call.arguments[0].text
  if (ts.isIdentifier(node.name)) bind(context, from, node.name.text, 'default')
  if (!ts.isObjectBindingPattern(node.name)) return
  for (const element of node.name.elements) {
    if (ts.isIdentifier(element.name)) bind(context, from, element.name.text, propertyKey(element.propertyName ?? element.name))
  }
}

function isVirtualFilename(node) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isPropertyAssignment(parent) && parent.initializer === child &&
      virtualFilenameKeys.has(propertyKey(parent.name))) return true
    if (ts.isCallExpression(parent) && parent.arguments.includes(child) &&
      virtualFilenameCalls.has(dottedName(parent.expression))) return true
    if (ts.isStatement(parent)) return false
  }
  return false
}

function runsOrImports(call) {
  return call.expression.kind === ts.SyntaxKind.ImportKeyword || runCall.test(dottedName(call.expression) ?? '')
}

/** True when the node is an argument, an array item or a template part of a call that runs or imports a file. */
function isRunArgument(node) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isCallExpression(parent) && parent.arguments.includes(child)) return runsOrImports(parent)
    if (!ts.isArrayLiteralExpression(parent) && !ts.isTemplateSpan(parent) && !ts.isTemplateExpression(parent)) return false
  }
  return false
}

/** Records a module reference. True when the node is only a reference, so its children need no visit. */
function collectModuleReference(context, node) {
  if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
    context.imports.push(bindImport(context, node))
    return true
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
    context.imports.push(node.moduleSpecifier.text)
    return true
  }
  if (!ts.isCallExpression(node) || !node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) return false
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword && !moduleCalls.has(dottedName(node.expression))) return false
  context.imports.push(node.arguments[0].text)
  for (const argument of node.arguments.slice(1)) collect(context, argument)
  return true
}

const isUrl = (node) => ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL'

function collect(context, node) {
  if (collectModuleReference(context, node)) return
  if (ts.isCallExpression(node)) {
    context.calls.push(node)
    if (runsOrImports(node)) {
      for (const argument of node.arguments) {
        const items = ts.isArrayLiteralExpression(argument) ? argument.elements : [argument]
        for (const item of items) if (ts.isIdentifier(item)) context.expressions.push(item)
      }
    }
  }
  if (ts.isVariableDeclaration(node)) bindRequire(context, node)
  const pathLike = (ts.isStringLiteralLike(node) && /[./]/.test(node.text)) || ts.isTemplateExpression(node) ||
    ts.isCallExpression(node) || isUrl(node)
  const propertyName = node.parent && (ts.isPropertyAssignment(node.parent) ||
    ts.isPropertyAccessExpression(node.parent)) && node.parent.name === node
  if (pathLike && !propertyName) context.candidates.push(node)
  ts.forEachChild(node, (child) => collect(context, child))
}

function bindingIn(name, target) {
  if (ts.isIdentifier(name)) return name.text === target ? name.parent : undefined
  for (const element of name.elements ?? []) {
    const found = !ts.isOmittedExpression(element) && bindingIn(element.name, target)
    if (found) return found
  }
  return undefined
}

function importBinding(statement, name) {
  const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined
  if (clause?.name?.text === name) return clause
  const bindings = clause?.namedBindings
  if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) return bindings
  return bindings && ts.isNamedImports(bindings) ? bindings.elements.find((element) => element.name.text === name) : undefined
}

/** The declaration of a name in one scope: a parameter, a loop variable, or a statement of the scope. */
function scopeDeclaration(scope, name) {
  const names = []
  if (ts.isFunctionLike(scope)) names.push(...scope.parameters.map((parameter) => parameter.name))
  if ((ts.isForOfStatement(scope) || ts.isForStatement(scope) || ts.isForInStatement(scope)) &&
    scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
    names.push(...scope.initializer.declarations.map((declaration) => declaration.name))
  }
  for (const statement of scope.statements ?? []) {
    if (ts.isVariableStatement(statement)) names.push(...statement.declarationList.declarations.map((declaration) => declaration.name))
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) return statement
    const imported = importBinding(statement, name)
    if (imported) return imported
  }
  for (const candidate of names) {
    const found = bindingIn(candidate, name)
    if (found) return found
  }
  return undefined
}

function declarationOf(identifier) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    const found = scopeDeclaration(scope, identifier.text)
    if (found) return found
  }
  return undefined
}

/**
 * Runs one evaluation step once for each node. A step that meets its own node again returns `unknownValue`. Only a
 * result that met no such cycle is kept, so a cut short result never reaches a later caller.
 */
function guarded(context, memo, node, compute) {
  if (memo.results.has(node)) return memo.results.get(node)
  if (memo.active.has(node)) {
    context.cycle = true
    return unknownValue
  }
  const outerCycle = context.cycle
  context.cycle = false
  memo.active.add(node)
  try {
    const result = compute()
    if (!context.cycle) memo.results.set(node, result)
    return result
  } finally {
    memo.active.delete(node)
    context.cycle ||= outerCycle
  }
}

function initializerOf(node) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return initializerOf(node.expression)
  }
  if (!ts.isIdentifier(node)) return node
  const declaration = declarationOf(node)
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer &&
    declaration.parent.flags & ts.NodeFlags.Const ? initializerOf(declaration.initializer) : declaration
}

/** The keys of a literal object, or of the JSON file that a default import names. */
function keysOf(context, node) {
  const object = initializerOf(node)
  if (object && ts.isObjectLiteralExpression(object)) {
    return object.properties.flatMap((property) => ts.isPropertyAssignment(property) &&
      (ts.isStringLiteralLike(property.name) || ts.isIdentifier(property.name)) ? [{ path: property.name.text }] : unknownValue)
  }
  const specifier = object && ts.isImportClause(object) ? object.parent.moduleSpecifier.text : undefined
  if (!specifier?.startsWith('.') || !specifier.endsWith('.json')) return unknownValue
  return Object.keys(JSON.parse(readFileSync(resolve(context.fileDirectory, specifier), 'utf8'))).map((key) => ({ path: key }))
}

/** The values of a literal collection: an array, a conditional array, the keys of an object, or a filtered array. */
function items(context, node) {
  return guarded(context, context.items, node, () => {
    const collection = initializerOf(node)
    if (collection && ts.isConditionalExpression(collection)) {
      return unique([...items(context, collection.whenTrue), ...items(context, collection.whenFalse)])
    }
    if (collection && ts.isArrayLiteralExpression(collection)) {
      return unique(collection.elements.flatMap((element) => {
        if (ts.isSpreadElement(element)) return items(context, element.expression)
        if (ts.isArrayLiteralExpression(element)) return element.elements[0] ? evaluate(context, element.elements[0]) : unknownValue
        return evaluate(context, element)
      }))
    }
    if (!collection || !ts.isCallExpression(collection) || !ts.isPropertyAccessExpression(collection.expression)) return unknownValue
    const method = dottedName(collection.expression)
    if (['Object.keys', 'Object.entries'].includes(method) && collection.arguments[0]) {
      return unique(keysOf(context, collection.arguments[0]))
    }
    const narrowing = ['filter', 'slice', 'toSorted', 'sort'].includes(collection.expression.name.text)
    return narrowing ? items(context, collection.expression.expression) : unknownValue
  })
}

/** The values of one property across the literal objects of a literal array. */
function propertyItems(context, node, key) {
  const collection = initializerOf(node)
  if (collection && ts.isConditionalExpression(collection)) {
    return unique([...propertyItems(context, collection.whenTrue, key), ...propertyItems(context, collection.whenFalse, key)])
  }
  if (!collection || !ts.isArrayLiteralExpression(collection)) return unknownValue
  return unique(collection.elements.flatMap((element) => {
    const object = initializerOf(element)
    const property = object && ts.isObjectLiteralExpression(object) &&
      object.properties.find((candidate) => propertyKey(candidate.name) === key)
    if (property && ts.isPropertyAssignment(property)) return evaluate(context, property.initializer)
    if (property && ts.isShorthandPropertyAssignment(property)) return evaluate(context, property.name)
    return unknownValue
  }))
}

/** The collection that a callback parameter or a `for...of` declaration takes its items from. */
function collectionOf(context, container) {
  if (ts.isVariableDeclaration(container)) {
    return ts.isForOfStatement(container.parent.parent) ? container.parent.parent.expression : undefined
  }
  const owner = container.parent
  const call = owner.parent
  if (owner.parameters.indexOf(container) !== 0 || !ts.isCallExpression(call) || !call.arguments.includes(owner)) return undefined
  const callee = call.expression
  if (ts.isPropertyAccessExpression(callee) && iterationMethods.has(callee.name.text)) return callee.expression
  if (ts.isCallExpression(callee) && /\.each$/.test(dottedName(callee.expression) ?? '')) return callee.arguments[0]
  return undefined
}

/** A callback parameter takes the items it iterates. A named function's parameter takes its call-site arguments. */
function parameterValues(context, parameter) {
  return guarded(context, context.values, parameter, () => {
    const owner = parameter.parent
    const call = owner.parent
    if (ts.isCallExpression(call) && call.arguments.includes(owner)) {
      const collection = collectionOf(context, parameter)
      return collection ? items(context, collection) : unknownValue
    }
    const index = owner.parameters.indexOf(parameter)
    const name = ts.isFunctionDeclaration(owner) ? owner.name : ts.isVariableDeclaration(call) ? call.name : undefined
    if (!name || !ts.isIdentifier(name)) return unknownValue
    const sites = context.calls.filter((site) => ts.isIdentifier(site.expression) && site.expression.text === name.text)
    if (!sites.length) return unknownValue
    return unique(sites.flatMap((site) => site.arguments[index] ? evaluate(context, site.arguments[index]) : unknownValue))
  })
}

function declarationValues(context, declaration) {
  if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration)) {
    return context.repositoryRoots.has(declaration.name.text) ? [{ path: context.repository }] : unknownValue
  }
  if (ts.isParameter(declaration)) return parameterValues(context, declaration)
  if (ts.isBindingElement(declaration)) {
    const pattern = declaration.parent
    const container = pattern.parent
    const collection = (ts.isParameter(container) || ts.isVariableDeclaration(container)) && collectionOf(context, container)
    if (!collection) return unknownValue
    if (ts.isObjectBindingPattern(pattern)) {
      return propertyItems(context, collection, propertyKey(declaration.propertyName ?? declaration.name))
    }
    return pattern.elements.indexOf(declaration) === 0 ? items(context, collection) : unknownValue
  }
  if (!ts.isVariableDeclaration(declaration)) return unknownValue
  if (ts.isForOfStatement(declaration.parent.parent)) return items(context, declaration.parent.parent.expression)
  const constant = declaration.initializer && declaration.parent.flags & ts.NodeFlags.Const
  return constant ? evaluate(context, declaration.initializer) : unknownValue
}

/** The `node:path`, `node:url` or `process` function that a call names: resolve, join, dirname, fileURLToPath, cwd. */
function pathCallee(context, callee) {
  if (ts.isIdentifier(callee)) {
    if (context.urlFunctions.has(callee.text)) return 'fileURLToPath'
    const name = context.pathFunctions.get(callee.text)
    return pathCalls.has(name) ? name : undefined
  }
  if (!ts.isPropertyAccessExpression(callee)) return undefined
  if (dottedName(callee) === 'process.cwd') return 'cwd'
  const owner = callee.expression
  const module = (ts.isIdentifier(owner) && context.pathFunctions.get(owner.text) === 'module') ||
    (ts.isPropertyAccessExpression(owner) && owner.name.text === 'posix' && ts.isIdentifier(owner.expression) &&
      context.pathFunctions.get(owner.expression.text) === 'module')
  return module && pathCalls.has(callee.name.text) ? callee.name.text : undefined
}

function combinePath(context, callee, parts) {
  const unknown = parts.findIndex((part) => (part.url ?? part.path) === undefined)
  const known = parts.slice(0, unknown === -1 ? parts.length : unknown).map((part) => part.url ?? part.path)
  const base = callee === 'resolve' ? resolve(context.workspaceRoot, ...known) : known.length ? posix.join(...known) : ''
  if (unknown === -1) return { path: base }
  return { prefix: (base ? `${base.replace(/\/$/, '')}/` : '') + parts[unknown].prefix }
}

function evaluateCall(context, node) {
  const callee = pathCallee(context, node.expression)
  if (callee === 'cwd') return [{ path: context.workspaceRoot }]
  if (!callee) return unknownValue
  const values = node.arguments.map((argument) => evaluate(context, argument))
  const first = values[0] ?? unknownValue
  if (callee === 'fileURLToPath') return first.map((value) => value.url !== undefined ? { path: value.url } : value)
  if (callee === 'dirname') return first.map((value) => value.path !== undefined ? { path: dirname(value.path) } : { prefix: '' })
  return product(values, (parts) => combinePath(context, callee, parts))
}

function evaluateUrl(context, node) {
  if (node.arguments?.length !== 2) return unknownValue
  return product([evaluate(context, node.arguments[0]), evaluate(context, node.arguments[1])], ([target, base]) => {
    if (base.url === undefined) return { prefix: '' }
    const directory = base.url.endsWith('/') ? base.url : `${dirname(base.url)}/`
    const known = target.url ?? target.path
    if (known === undefined) return { prefix: directory + target.prefix }
    return { url: resolve(directory, known) + (known.endsWith('/') ? '/' : '') }
  })
}

function evaluateIdentifier(context, node) {
  if (node.text === '__dirname') return [{ path: context.fileDirectory }]
  if (node.text === '__filename') return [{ path: context.file }]
  const declaration = declarationOf(node)
  return declaration ? declarationValues(context, declaration) : unknownValue
}

function evaluateMeta(context, node) {
  if (node.name.text === 'dirname') return [{ path: context.fileDirectory }]
  if (node.name.text === 'filename') return [{ path: context.file }]
  return node.name.text === 'url' ? [{ url: context.file }] : unknownValue
}

function evaluate(context, node) {
  return guarded(context, context.values, node, () => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)) return evaluate(context, node.expression)
    if (ts.isConditionalExpression(node)) return unique([...evaluate(context, node.whenTrue), ...evaluate(context, node.whenFalse)])
    if (ts.isStringLiteralLike(node)) return [{ path: node.text }]
    if (ts.isTemplateExpression(node)) {
      const parts = [[{ path: node.head.text }], ...node.templateSpans.flatMap((span) =>
        [evaluate(context, span.expression), [{ path: span.literal.text }]])]
      return product(parts, concatenate)
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return product([evaluate(context, node.left), evaluate(context, node.right)], concatenate)
    }
    if (ts.isIdentifier(node)) return evaluateIdentifier(context, node)
    if (ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression)) return evaluateMeta(context, node)
    if (isUrl(node)) return evaluateUrl(context, node)
    return ts.isCallExpression(node) ? evaluateCall(context, node) : unknownValue
  })
}

/**
 * Parses one module into its imports and the values of each path expression (a literal, a `node:path` or URL call,
 * `process.cwd()`, or an argument of a call that runs or imports a file). An identifier takes the values of its const
 * initializer, the literal table its loop, callback or `each` iterates, or the arguments at its function's call
 * sites. A value is `{ path }` or `{ url }` when known before the run, and `{ prefix }` when the run supplies a part.
 */
export function moduleFacts({ file, source = readFileSync(file, 'utf8'), workspaceRoot, repository }) {
  const context = { file, fileDirectory: dirname(file), workspaceRoot, repository,
    source: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file)),
    pathFunctions: new Map(), urlFunctions: new Set(), repositoryRoots: new Set(), imports: [], candidates: [], expressions: [], calls: [],
    values: { results: new Map(), active: new Set() }, items: { results: new Map(), active: new Set() }, cycle: false }
  collect(context, context.source)
  const expressions = context.expressions.concat(context.candidates.filter((node) =>
    (!ts.isCallExpression(node) || pathCallee(context, node.expression)) && !isVirtualFilename(node)))
  const paths = expressions.flatMap((node) => {
    const line = context.source.getLineAndCharacterOfPosition(node.getStart(context.source)).line + 1
    const run = ts.isIdentifier(node) || isRunArgument(node)
    return evaluate(context, node).map((value) => ({ ...value, line, run }))
  })
  return { imports: context.imports, paths }
}
