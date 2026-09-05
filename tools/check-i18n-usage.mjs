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

function localReferences(source, checker) {
  const references = new Map()
  function visit(node) {
    if (ts.isIdentifier(node)) {
      const symbol = ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : ts.isExportSpecifier(node.parent) ? checker.getExportSpecifierLocalTargetSymbol(node.parent)
          : checker.getSymbolAtLocation(node)
      if (symbol) {
        if (!references.has(symbol)) references.set(symbol, [])
        references.get(symbol).push(node)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return references
}

function parameterArguments(parameter, references, checker) {
  const owner = parameter.parent
  if (!ts.isFunctionDeclaration(owner) || !owner.name ||
    owner.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return undefined
  const callers = references.get(checker.getSymbolAtLocation(owner.name)) ?? []
  const position = owner.parameters.indexOf(parameter)
  const argumentsFound = []
  for (const reference of callers) {
    if (reference === owner.name) continue
    const parent = reference.parent
    if (ts.isCallExpression(parent) && parent.expression === reference) {
      if (parent.arguments.some(ts.isSpreadElement) || !parent.arguments[position]) return undefined
      argumentsFound.push(parent.arguments[position])
    } else if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
      parent.tagName === reference && position === 0) argumentsFound.push(parent.attributes)
    else if (!ts.isJsxClosingElement(parent)) return undefined
  }
  return argumentsFound.length ? argumentsFound : undefined
}

function bindingSources(source, checker) {
  const references = localReferences(source, checker)
  function written(binding) {
    const usages = references.get(checker.getSymbolAtLocation(binding.name)) ?? []
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
  function member(expression, name, seen) {
    expression = unwrap(expression)
    if (!expression || seen.has(expression)) return undefined
    seen = new Set([...seen, expression])
    if (ts.isIdentifier(expression)) return members(inputs(checker.getSymbolAtLocation(expression)?.valueDeclaration, seen), name, seen)
    if (!ts.isObjectLiteralExpression(expression) && !ts.isJsxAttributes(expression)) return undefined
    for (const item of [...expression.properties].reverse()) {
      if (ts.isSpreadAssignment(item) || ts.isJsxSpreadAttribute(item)) {
        const found = member(item.expression, name, seen)
        if (found === undefined || found.length) return found
      } else if (item.name?.getText(source) === name) {
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
    if (ts.isParameter(binding)) return parameterArguments(binding, references, checker)
    if (ts.isBindingElement(binding) && ts.isObjectBindingPattern(binding.parent) && !binding.dotDotDotToken) {
      const container = binding.parent.parent
      const values = ts.isParameter(container) ? parameterArguments(container, references, checker)
        : container.initializer ? [container.initializer] : undefined
      return members(values, (binding.propertyName ?? binding.name).getText(source), visited)
    }
    return undefined
  }
  return inputs
}

function extractor(source, checker) {
  const declaration = (identifier) => checker.getSymbolAtLocation(identifier)?.valueDeclaration
  const inputs = bindingSources(source, checker)
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
    if (!expression) return undefined
    if (ts.isCallExpression(expression)) {
      const name = factoryName(expression.expression)
      if (["useTranslations", "getTranslations"].includes(name)) return factory(expression, false)
    }
    if (!ts.isIdentifier(expression)) return undefined
    const binding = declaration(expression)
    if (!binding || seen.has(binding)) return undefined
    const visited = new Set([...seen, binding])
    if (ts.isVariableDeclaration(binding)) return translator(binding.initializer, visited)
    if (ts.isBindingElement(binding) && (binding.propertyName ?? binding.name).getText(source) === "t") {
      const initializer = unwrap(binding.parent.parent.initializer)
      if (initializer && ts.isCallExpression(initializer) && factoryName(initializer.expression) === "useTranslation") {
        return factory(initializer, true)
      }
    }
    const incoming = inputs(binding)
    if (incoming) {
      const translations = incoming.map((value) => translator(value, visited))
      const prefix = translations[0]?.prefix
      if (prefix !== undefined && translations.every((value) => value?.prefix === prefix)) return { prefix }
    }
    return undefined
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
  const compilerOptions = { noResolve: true, noLib: true, allowJs: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve }
  const host = ts.createCompilerHost(compilerOptions, true)
  host.getSourceFile = (path, languageVersion) => sources.has(resolve(path))
    ? ts.createSourceFile(path, sources.get(resolve(path)), languageVersion, true) : undefined
  const program = ts.createProgram([...sources.keys()], compilerOptions, host)
  if (program.getSourceFiles().length !== paths.length) throw new Error("parser did not load every source file")
  const checker = program.getTypeChecker()
  const diagnostics = program.getSyntacticDiagnostics()
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  return program.getSourceFiles().flatMap((source) => extractor(source, checker).map((usage) => ({
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
