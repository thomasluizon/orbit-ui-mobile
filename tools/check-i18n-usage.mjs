#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const USAGE = `usage: check-i18n-usage.mjs [--root <directory>] [--staged]

Checks translation literals in apps/web, apps/mobile and packages/shared against
en.json AND pt-BR.json, and checks catalog key parity. No baseline.
Reports unresolved calls by binding or key expression, without failing.

  --root <directory>  repository root (defaults to this script's repository)
  --staged            read source and catalogs from the git index; check staged
                      sources, or all indexed sources when a catalog is staged
  --help, -h          print usage and exit 0

No stdin. Exit codes: 0 clean, 1 missing keys/parity, 2 usage or read/parse error.`
const CATALOGS = ["en", "pt-BR"].map((locale) => `packages/shared/src/i18n/${locale}.json`)
const SOURCE_ROOTS = ["apps/web", "apps/mobile", "packages/shared"]
const IGNORED = new Set(["node_modules", ".next", ".expo", "android", "ios", "dist", "build", "coverage"])
const isSource = (path) => SOURCE_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
  /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path) &&
  !path.split("/").some((part) => IGNORED.has(part))

function options(argv) {
  const result = { root: resolve(dirname(fileURLToPath(import.meta.url)), ".."), staged: false }
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--staged") result.staged = true
    else if (argv[index] === "--root" && argv[index + 1] && !argv[index + 1].startsWith("-")) {
      result.root = resolve(argv[++index])
    } else throw new Error(`unknown or incomplete argument: ${argv[index]}`)
  }
  return result
}

function inventory(root) {
  const paths = []
  function walk(directory) {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory() && !IGNORED.has(entry.name)) walk(path)
      else if (entry.isFile()) {
        const name = relative(root, path).replaceAll("\\", "/")
        if (isSource(name)) paths.push(name)
      }
    }
  }
  SOURCE_ROOTS.forEach((path) => walk(join(root, path)))
  return paths.sort()
}

function snapshot({ root, staged }) {
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const read = staged ? (path) => git(["show", `:${path}`]) : (path) => readFileSync(join(root, path), "utf8")
  if (!staged) return { paths: inventory(root), read }
  const changed = git(["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z"]).split("\0").filter(Boolean)
  const indexed = git(["ls-files", "--cached", "-z"]).split("\0").filter(Boolean)
  const candidates = changed.some((path) => CATALOGS.includes(path)) ? indexed : changed
  return { paths: candidates.filter((path) => isSource(path) && indexed.includes(path)).sort(), read }
}

function leaves(catalog, prefix = "", keys = new Set()) {
  for (const [name, value] of Object.entries(catalog)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (typeof value === "string") keys.add(key)
    else if (value && typeof value === "object") leaves(value, key, keys)
    else throw new Error(`invalid catalog value: ${key}`)
  }
  return keys
}

function unwrap(expression) {
  while (expression && (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isAwaitExpression(expression))) {
    expression = expression.expression
  }
  return expression
}

function referencedSymbol(node, checker) {
  const symbol = ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : ts.isExportSpecifier(node.parent) ? checker.getExportSpecifierLocalTargetSymbol(node.parent)
      : checker.getSymbolAtLocation(node)
  if (!(symbol?.flags & ts.SymbolFlags.Alias)) return symbol
  const target = checker.getAliasedSymbol(symbol)
  return target.valueDeclaration ? target : symbol
}

function programReferences(sources, checker) {
  const references = new Map()
  function visit(node) {
    if (ts.isIdentifier(node)) {
      const symbol = referencedSymbol(node, checker)
      if (symbol) {
        if (!references.has(symbol)) references.set(symbol, [])
        references.get(symbol).push(node)
      }
    }
    ts.forEachChild(node, visit)
  }
  sources.forEach(visit)
  return references
}

function localReferences(source, checker) {
  return programReferences([source], checker)
}

function parameterArguments(parameter, references, checker) {
  const owner = parameter.parent
  if (!ts.isFunctionDeclaration(owner) || !owner.name) return undefined
  const callers = references.get(referencedSymbol(owner.name, checker)) ?? []
  const position = owner.parameters.indexOf(parameter)
  const argumentsFound = []
  for (const reference of callers) {
    if (reference === owner.name) continue
    const parent = reference.parent
    if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) ||
      ts.isExportSpecifier(parent)) continue
    if (ts.isCallExpression(parent) && parent.expression === reference) {
      if (parent.arguments.some(ts.isSpreadElement) || !parent.arguments[position]) return undefined
      argumentsFound.push(parent.arguments[position])
    } else if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
      parent.tagName === reference && position === 0) argumentsFound.push(parent.attributes)
    else if (!ts.isJsxClosingElement(parent)) return undefined
  }
  return argumentsFound.length ? argumentsFound : undefined
}

function bindingSources(source, checker, programReferences) {
  const references = localReferences(source, checker)
  const propertyName = (name) => ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text : name?.getText(name.getSourceFile())
  function confined(binding) {
    if (!binding?.name || !ts.isIdentifier(binding.name)) return false
    if (ts.isVariableDeclaration(binding) && binding.parent.parent.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false
    const usages = references.get(referencedSymbol(binding.name, checker)) ?? []
    return usages.every((reference) => {
      if (reference === binding.name) return true
      const parent = reference.parent
      // Spreads copy props; destructuring extracts values without sharing the carrier.
      if (ts.isJsxSpreadAttribute(parent)) return true
      if (ts.isVariableDeclaration(parent) && parent.initializer === reference &&
        ts.isObjectBindingPattern(parent.name)) return parent.name.elements.every(
          (element) => ts.isIdentifier(element.name) && !element.initializer)
      return ts.isPropertyAccessExpression(parent) && parent.expression === reference &&
        parent.name.text === "t" && ts.isCallExpression(parent.parent) && parent.parent.expression === parent
    })
  }
  function written(binding) {
    const usages = references.get(referencedSymbol(binding.name, checker)) ?? []
    return usages.some((reference) => {
      let target = reference
      while (ts.isPropertyAccessExpression(target.parent) || ts.isElementAccessExpression(target.parent)) target = target.parent
      return ts.isBinaryExpression(target.parent) && target.parent.left === target &&
        target.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    })
  }
  function members(expressions, name, seen) {
    if (!expressions?.length) return undefined
    const groups = expressions.map((expression) => member(expression, name, seen))
    return groups.every((group) => group?.length) ? groups.flat() : undefined
  }
  function returned(call) {
    if (!ts.isIdentifier(call.expression)) return undefined
    const declaration = referencedSymbol(call.expression, checker)?.valueDeclaration
    if (!declaration) return undefined
    const owner = ts.isFunctionDeclaration(declaration) ? declaration
      : ts.isVariableDeclaration(declaration) ? unwrap(declaration.initializer) : undefined
    if (!owner || (!ts.isFunctionDeclaration(owner) && !ts.isArrowFunction(owner) && !ts.isFunctionExpression(owner))) return undefined
    if (!ts.isBlock(owner.body)) return [owner.body]
    const values = []
    function visit(node) {
      if (node !== owner.body && ts.isFunctionLike(node)) return
      if (ts.isReturnStatement(node)) {
        if (!node.expression) values.length = 0
        else values.push(node.expression)
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(owner.body)
    return values.length ? values : undefined
  }
  function member(expression, name, seen) {
    expression = unwrap(expression)
    if (!expression || seen.has(expression)) return undefined
    seen = new Set([...seen, expression])
    if (ts.isIdentifier(expression)) {
      const binding = checker.getSymbolAtLocation(expression)?.valueDeclaration
      return confined(binding) ? members(inputs(binding, seen), name, seen) : undefined
    }
    if (ts.isCallExpression(expression)) return members(returned(expression), name, seen)
    if (!ts.isObjectLiteralExpression(expression) && !ts.isJsxAttributes(expression)) return undefined
    if (ts.isObjectLiteralExpression(expression) && expression.properties.some((item) =>
      !ts.isPropertyAssignment(item) && !ts.isShorthandPropertyAssignment(item) && !ts.isSpreadAssignment(item))) return undefined
    for (const item of [...expression.properties].reverse()) {
      if (ts.isSpreadAssignment(item) || ts.isJsxSpreadAttribute(item)) {
        const found = member(item.expression, name, seen)
        if (found === undefined || found.length) return found
      } else if (propertyName(item.name) === name) {
        if (ts.isShorthandPropertyAssignment(item)) {
          const binding = checker.getShorthandAssignmentValueSymbol(item)?.valueDeclaration
          return binding?.name && ts.isIdentifier(binding.name) ? [binding.name] : undefined
        }
        const initializer = item.initializer
        return initializer ? [ts.isJsxExpression(initializer) ? initializer.expression : initializer] : undefined
      } else if (item.name && ts.isComputedPropertyName(item.name)) return undefined
    }
    return []
  }
  function inputs(binding, seen = new Set()) {
    if (!binding || seen.has(binding) || written(binding)) return undefined
    const visited = new Set([...seen, binding])
    if (ts.isVariableDeclaration(binding)) return binding.initializer ? [binding.initializer] : undefined
    if (ts.isParameter(binding)) return parameterArguments(binding, programReferences, checker)
    if (ts.isBindingElement(binding) && ts.isObjectBindingPattern(binding.parent) && !binding.dotDotDotToken) {
      const container = binding.parent.parent
      const values = ts.isParameter(container) ? parameterArguments(container, programReferences, checker)
        : container.initializer ? [container.initializer] : undefined
      return members(values, propertyName(binding.propertyName ?? binding.name), visited)
    }
    return undefined
  }
  return { inputs, member }
}

function extractor(source, checker, references) {
  const declaration = (identifier) => referencedSymbol(identifier, checker)?.valueDeclaration
  const { inputs, member } = bindingSources(source, checker, references)
  const nameText = (name) => ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text : name?.getText(name.getSourceFile())
  function literal(expression, seen = new Set()) {
    expression = unwrap(expression)
    if (!expression) return undefined
    if (ts.isStringLiteral(expression)) return expression.text
    if (!ts.isIdentifier(expression)) return undefined
    const binding = declaration(expression)
    if (!binding || seen.has(binding) || !ts.isVariableDeclaration(binding) ||
      !(binding.parent.flags & ts.NodeFlags.Const)) return undefined
    return literal(binding.initializer, new Set([...seen, binding]))
  }
  function factoryName(expression) {
    if (!ts.isIdentifier(expression)) return ""
    const symbol = checker.getSymbolAtLocation(expression)
    const imported = symbol?.declarations?.find(ts.isImportSpecifier)
    return imported ? (imported.propertyName ?? imported.name).text : expression.text
  }
  function property(expression, name) {
    return expression && ts.isObjectLiteralExpression(expression)
      ? expression.properties.find((member) => ts.isPropertyAssignment(member) && member.name.getText(source) === name)?.initializer
      : undefined
  }
  function factory(call, mobile) {
    const argument = unwrap(call.arguments[0])
    if (mobile) {
      // i18next namespaces select resource bundles; only keyPrefix prefixes keys.
      const prefix = property(call.arguments[1], "keyPrefix")
      const namespace = argument ? literal(argument) : "translation"
      return { prefix: namespace === "translation" ? (prefix ? literal(prefix) : "") : undefined }
    }
    const namespace = argument && ts.isObjectLiteralExpression(argument) ? property(argument, "namespace") : argument
    return { prefix: namespace ? literal(namespace) : "" }
  }
  function translator(expression, seen = new Set()) {
    expression = unwrap(expression)
    if (!expression || seen.has(expression)) return undefined
    if (ts.isCallExpression(expression)) {
      const name = factoryName(expression.expression)
      if (["useTranslations", "getTranslations"].includes(name)) return factory(expression, false)
    }
    if ((ts.isPropertyAccessExpression(expression) && expression.name.text === "t") ||
      (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === "t")) {
      const carrier = unwrap(expression.expression)
      const binding = ts.isIdentifier(carrier) ? declaration(carrier) : undefined
      if (!ts.isIdentifier(carrier) || (binding && !ts.isImportClause(binding) && !ts.isImportSpecifier(binding))) {
        return agreedTranslator(member(carrier, "t", seen), new Set([...seen, expression]))
      }
      return undefined
    }
    if (!ts.isIdentifier(expression)) return undefined
    const binding = declaration(expression)
    if (!binding || seen.has(binding)) return undefined
    const visited = new Set([...seen, binding])
    if (ts.isVariableDeclaration(binding)) {
      const initial = translator(binding.initializer, visited)
      if (!initial) return undefined
      const incoming = inputs(binding)
      return incoming ? initial : { prefix: undefined }
    }
    if (ts.isBindingElement(binding) && nameText(binding.propertyName ?? binding.name) === "t") {
      const initializer = unwrap(binding.parent.parent.initializer)
      if (initializer && ts.isCallExpression(initializer) && factoryName(initializer.expression) === "useTranslation") {
        return factory(initializer, true)
      }
      return agreedTranslator(inputs(binding), visited)
    }
    const incoming = inputs(binding)
    if (incoming) {
      const translations = incoming.map((value) => translator(value, visited))
      if (translations.some(Boolean)) return agreedTranslator(incoming, visited)
    }
    return undefined
  }
  function agreedTranslator(values, seen) {
    const translations = values?.map((value) => translator(value, seen))
    const prefix = translations?.[0]?.prefix
    return { prefix: prefix !== undefined && translations.every((value) => value?.prefix === prefix) ? prefix : undefined }
  }
  function callTranslator(expression) {
    const bound = translator(expression)
    if (bound) return bound
    if (ts.isIdentifier(expression) && expression.text === "t") {
      // A passed translator can carry a namespace that this local binding cannot prove.
      return { prefix: declaration(expression) ? undefined : "" }
    }
    if (ts.isPropertyAccessExpression(expression)) {
      if (["rich", "markup"].includes(expression.name.text)) return translator(expression.expression)
      if (expression.name.text === "t") return { prefix: "" }
    }
    return undefined
  }
  const usages = []
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const translation = callTranslator(node.expression)
      if (translation) {
        const key = literal(node.arguments[0])
        usages.push({
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          key: key !== undefined && translation.prefix !== undefined
            ? [translation.prefix, key].filter(Boolean).join(".") : undefined,
          unresolvedBinding: translation.prefix === undefined,
          literalKey: key !== undefined,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return usages
}

function analyze(paths, read, root) {
  const sources = new Map(paths.map((path) => [resolve(root, path), read(path)]))
  const compilerOptions = {
    noLib: true,
    allowJs: true,
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    moduleDetection: ts.ModuleDetectionKind.Force,
  }
  const host = ts.createCompilerHost(compilerOptions, true)
  function sourceModule(candidate) {
    for (const path of [candidate, ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => candidate + extension),
      ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => join(candidate, `index${extension}`))]) {
      if (sources.has(resolve(path))) {
        const extension = path.endsWith("x") ? ts.Extension.Tsx : ts.Extension.Ts
        return { resolvedFileName: resolve(path), extension }
      }
    }
    return undefined
  }
  host.resolveModuleNames = (names, containingFile) => names.map((name) => {
    let candidate
    if (name.startsWith(".")) candidate = resolve(dirname(containingFile), name)
    else if (name === "@orbit/shared") candidate = join(root, "packages/shared/src/index")
    else if (name.startsWith("@orbit/shared/")) candidate = join(root, "packages/shared/src", name.slice(14))
    else if (name.startsWith("@/")) {
      const relativePath = relative(root, containingFile).replaceAll("\\", "/")
      const app = relativePath.match(/^apps\/(web|mobile)\//)?.[1]
      if (app) candidate = join(root, "apps", app, name.slice(2))
    }
    return candidate ? sourceModule(candidate) : undefined
  })
  host.getSourceFile = (path, languageVersion) => sources.has(resolve(path))
    ? ts.createSourceFile(path, sources.get(resolve(path)), languageVersion, true) : undefined
  const program = ts.createProgram([...sources.keys()], compilerOptions, host)
  if (program.getSourceFiles().length !== paths.length) throw new Error("parser did not load every source file")
  const checker = program.getTypeChecker()
  const diagnostics = program.getSyntacticDiagnostics()
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  const references = programReferences(program.getSourceFiles(), checker)
  return program.getSourceFiles().flatMap((source) => extractor(source, checker, references).map((usage) => ({
    file: relative(root, source.fileName).replaceAll("\\", "/"), ...usage,
  })))
}

function run(settings) {
  const { paths, read } = snapshot(settings)
  const catalogs = CATALOGS.map((path) => leaves(JSON.parse(read(path))))
  let misses = 0
  for (const key of new Set(catalogs.flatMap((keys) => [...keys]))) {
    catalogs.forEach((keys, index) => {
      if (!keys.has(key)) {
        console.error(`${CATALOGS[index]}:1: catalog parity missing ${key}`)
        misses++
      }
    })
  }
  const usages = analyze(paths, read, settings.root)
  const unresolved = new Map()
  for (const { file, line, key } of usages) {
    if (key === undefined) unresolved.set(file, (unresolved.get(file) ?? 0) + 1)
    else {
      const missing = CATALOGS.filter((_, index) => !catalogs[index].has(key))
      if (missing.length) {
        console.error(`${file}:${line}: missing ${key} in ${missing.map((path) => path.split("/").at(-1)).join(", ")}`)
        misses++
      }
    }
  }
  const count = [...unresolved.values()].reduce((sum, value) => sum + value, 0)
  const bindings = usages.filter((usage) => usage.unresolvedBinding)
  console.log(`Unresolved translation calls: ${count} in ${unresolved.size} files`)
  for (const [file, total] of [...unresolved].sort()) console.log(`  ${file}: ${total}`)
  console.log(`Unresolved translator bindings: ${bindings.length}; ${bindings.filter((usage) => usage.literalKey).length} with literal keys`)
  console.log(`Nonliteral keys with resolved translators: ${count - bindings.length}`)
  console.log(`i18n usage: ${usages.length - count} resolved calls in ${paths.length} files; ${misses} misses`)
  return misses ? 1 : 0
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
} else {
  try {
    process.exitCode = run(options(process.argv.slice(2)))
  } catch (error) {
    console.error(`i18n usage: ${error.message}`)
    process.exitCode = 2
  }
}
