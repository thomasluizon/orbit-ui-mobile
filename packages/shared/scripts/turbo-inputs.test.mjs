import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync }
  from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { repositoryRoot as repository } from '../src/test-support/repository-root.ts'

const turbo = resolve(repository, 'node_modules/turbo/bin/turbo')
const configuration = readFileSync(resolve(repository, 'turbo.json'), 'utf8')
const { packageManager } = JSON.parse(readFileSync(resolve(repository, 'package.json'), 'utf8'))
const tokenDirectory = 'design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens'
const desktopFilesTheWebTestsRead = [
  'apps/desktop/locales/en.json', 'apps/desktop/locales/pt-BR.json',
  'apps/desktop/src-tauri/src/launch.js', 'apps/desktop/src-tauri/src/palette.js',
]
const consumers = [
  { workspace: 'packages/shared', name: '@orbit/shared', inputs: [
    '.github/workflows/contract-rebaseline.yml',
    'apps/web/components/input.tsx', 'apps/mobile/modules/widget/input.kt',
    'apps/web/e2e/layout/interaction-fill-clearance.spec.ts',
    'apps/mobile/__tests__/components/ui/interaction-fill-clearance.test.tsx',
    'design/canvas/Orbit Widget Android.dc.html', `${tokenDirectory}/typography.css`,
    '.gitignore', 'apps/mobile/.gitignore', 'eslint-rules/no-comments.cjs', 'tsconfig.base.json',
    'evals/astra/catalog.yaml',
  ] },
  { workspace: 'apps/desktop', name: '@orbit/desktop', inputs: [
    '.github/workflows/desktop-release.yml', '.github/workflows/desktop-acceptance.yml',
    'apps/web/components/auth/desktop-auth-bridge.tsx',
    'apps/web/lib/desktop-push.ts', 'apps/web/lib/desktop-updates.ts',
    '.github/workflows/desktop-build.yml', '.github/workflows/release.yml',
    'apps/mobile/lib/turnstile-frames.ts', 'apps/web/proxy.ts', 'apps/web/web-compatibility.json',
    'apps/web/test-support/hermetic/mock-api/fixtures/chat-stream.ts', 'design/brand/orbit-mark-16.svg',
    'design/brand/orbit-mark-accent.svg', 'packages/shared/src/chat/stream-turn.ts', 'tools/desktop-bench/probe.js',
    'tsconfig.base.json', 'apps/web/tsconfig.json', 'packages/shared/tsconfig.json',
  ] },
  { workspace: 'apps/mobile', name: '@orbit/mobile', inputs: [
    '.github/workflows/android-release.yml', '.github/workflows/ios-build.yml', '.github/workflows/ios-release.yml',
    `${tokenDirectory}/colors.css`, 'packages/shared/src/theme/neutral-ramp.ts',
    'tools/__tests__/android-deployment-fixture.json', 'tsconfig.base.json',
    'apps/web/test-support/hermetic/fixture-request.ts', 'apps/web/test-support/hermetic/mock-api/server.ts',
    'apps/web/tsconfig.json',
  ] },
  { workspace: 'apps/web', name: '@orbit/web', inputs: [
    'tools/check-surface-scope.mjs', 'tools/arch-map.mjs', 'tools/lib/escape-regex.mjs', 'DESIGN.md', 'design/brand/png/orbit-platform-icon-512.png',
    'apps/mobile/components/ui/list-row.tsx', 'packages/shared/src/__tests__/contrast.ts', 'tsconfig.base.json',
    'tsconfig.json', 'apps/mobile/tsconfig.json',
    ...desktopFilesTheWebTestsRead,
  ] },
  { workspace: 'eslint-rules', name: '@orbit/eslint-rules', inputs: [
    'apps/web/eslint.config.mjs', 'apps/mobile/eslint.config.js', 'apps/web/tsconfig.json',
    'apps/web/app/globals.css', 'apps/mobile/components/ui/input.css',
    'packages/shared/src/theme/spacing.json', 'packages/shared/src/theme/spacing.css',
    `${tokenDirectory}/spacing.css`, 'packages/shared/src/i18n/en.json', 'packages/shared/src/i18n/pt-BR.json',
    'tsconfig.json',
  ] },
]
const fixtures = []

function write(root, filename, contents) {
  const target = resolve(root, filename)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

function fixture(consumer, config = configuration) {
  const root = mkdtempSync(resolve(tmpdir(), 'orbit-turbo-inputs-'))
  fixtures.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'cache-input-fixture', private: true, packageManager,
    workspaces: ['apps/*', 'packages/*', 'eslint-rules'] }))
  write(root, 'turbo.json', config)
  write(root, '.gitignore', '.turbo/\ncoverage/\nexecutions\n')
  for (const { workspace, name } of consumers) {
    write(root, `${workspace}/package.json`, JSON.stringify({ name, scripts: { test: 'node run.mjs' } }))
  }
  for (const input of consumer.inputs.filter((input) => input !== '.gitignore')) write(root, input, 'valid')
  const inputs = consumer.inputs.filter((input) => input !== '.gitignore')
  write(root, `${consumer.workspace}/run.mjs`, `
    import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
    import { resolve } from 'node:path'
    const root = resolve(${JSON.stringify(root)})
    appendFileSync(resolve(root, 'executions'), 'executed\\n')
    for (const input of ${JSON.stringify(inputs)}) {
      if (readFileSync(resolve(root, input), 'utf8') !== 'valid') {
        process.stderr.write('external input rejected: ' + input + '\\n')
        process.exit(1)
      }
    }
    mkdirSync('coverage', { recursive: true })
    writeFileSync('coverage/result.txt', 'covered')
  `)
  return root
}

function run(root, name) {
  return spawnSync(process.execPath, [turbo, 'run', 'test', `--filter=${name}`, '--cache=local:rw',
    '--cache-dir=.turbo/cache'], { cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TURBO_TELEMETRY_DISABLED: '1' } })
}

function expectRun(root, name, status, executions) {
  const result = run(root, name)
  expect(result.status, result.stdout + result.stderr).toBe(status)
  expect(readFileSync(resolve(root, 'executions'), 'utf8')).toBe('executed\n'.repeat(executions))
  return result
}

function taskHash(root, name) {
  const result = spawnSync(process.execPath, [turbo, 'run', 'test', `--filter=${name}`, '--dry=json'], { cwd: root,
    encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TURBO_TELEMETRY_DISABLED: '1' } })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  return JSON.parse(result.stdout).tasks.find((task) => task.taskId === `${name}#test`).hash
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('moves the @orbit/web#test hash that keys the cached web unit results when a desktop file the web tests read changes', () => {
  const consumer = consumers.find(({ name }) => name === '@orbit/web')
  const root = fixture(consumer)
  write(root, 'apps/desktop/src-tauri/src/main.rs', 'fn main() {}')
  const baseline = taskHash(root, consumer.name)
  write(root, 'apps/desktop/src-tauri/src/main.rs', 'fn main() { changed() }')
  expect(taskHash(root, consumer.name)).toBe(baseline)
  for (const input of desktopFilesTheWebTestsRead) {
    write(root, input, 'changed')
    expect(taskHash(root, consumer.name), input).not.toBe(baseline)
    write(root, input, 'valid')
  }
  expect(taskHash(root, consumer.name)).toBe(baseline)
}, 30_000)

it('demonstrates stale success when workflow inputs are omitted', () => {
  const consumer = consumers[1]
  const root = fixture(consumer, JSON.stringify({ tasks: { test: { outputs: ['coverage/**'] } } }))
  expectRun(root, consumer.name, 0, 1)
  write(root, consumer.inputs[0], 'invalid')
  expectRun(root, consumer.name, 0, 1)
}, 30_000)

it('executes the shared guard again when another consumer task configuration changes', () => {
  const consumer = consumers[0]
  const root = fixture({ ...consumer, inputs: [] })
  symlinkSync(resolve(repository, 'node_modules'), resolve(root, 'node_modules'), 'junction')
  write(root, '.gitignore', '.turbo/\ncoverage/\nexecutions\nnode_modules/\n')
  write(root, `${consumer.workspace}/scripts/turbo-inputs.test.mjs`, readFileSync(import.meta.filename, 'utf8'))
  write(root, `${consumer.workspace}/src/test-support/repository-root.ts`,
    readFileSync(resolve(import.meta.dirname, '../src/test-support/repository-root.ts'), 'utf8'))
  write(root, `${consumer.workspace}/vitest.config.mjs`, `
    export default { test: { maxWorkers: 1 } }
  `)
  write(root, `${consumer.workspace}/run.mjs`, `
    import { appendFileSync } from 'node:fs'
    import { spawnSync } from 'node:child_process'
    appendFileSync(${JSON.stringify(resolve(root, 'executions'))}, 'executed\\n')
    const result = spawnSync(process.execPath, [${JSON.stringify(resolve(root, 'node_modules/vitest/vitest.mjs'))},
      'run', 'scripts/turbo-inputs.test.mjs', '--config=vitest.config.mjs',
      '-t', '@orbit/desktop'], { stdio: 'inherit' })
    process.exit(result.status ?? 1)
  `)
  const initial = expectRun(root, consumer.name, 0, 1)
  expect(initial.stdout + initial.stderr).toContain('2 passed')
  expectRun(root, consumer.name, 0, 1)
  write(root, 'unrelated-root.txt', 'unrelated')
  expectRun(root, consumer.name, 0, 1)
  const changed = JSON.parse(configuration)
  changed.tasks['@orbit/desktop#test'].inputs = ['$TURBO_DEFAULT$']
  write(root, 'turbo.json', JSON.stringify(changed))
  const result = expectRun(root, consumer.name, 1, 2)
  expect(result.stdout + result.stderr).toContain('2 failed')
}, 60_000)

describe.each(consumers)('$name external test inputs', (consumer) => {
  it('retains valid hits and coverage, then executes every changed external input', () => {
    const root = fixture(consumer)
    expectRun(root, consumer.name, 0, 1)
    rmSync(resolve(root, consumer.workspace, 'coverage'), { recursive: true })
    expectRun(root, consumer.name, 0, 1)
    expect(readFileSync(resolve(root, consumer.workspace, 'coverage/result.txt'), 'utf8')).toBe('covered')
    write(root, 'unrelated-root.txt', 'unrelated')
    write(root, '.github/workflows/unrelated.txt', 'unrelated')
    expectRun(root, consumer.name, 0, 1)
    write(root, `${consumer.workspace}/local-source.ts`, 'export const changed = true')
    expectRun(root, consumer.name, 0, 2)
    let executions = 2
    for (const input of consumer.inputs) {
      const original = readFileSync(resolve(root, input), 'utf8')
      write(root, input, 'invalid')
      const result = expectRun(root, consumer.name, input === '.gitignore' ? 0 : 1, ++executions)
      if (input !== '.gitignore') expect(result.stdout + result.stderr).toContain(`external input rejected: ${input}`)
      write(root, input, original)
    }
    expectRun(root, consumer.name, 0, executions)
  }, 120_000)

  it('executes again when an external input is deleted', () => {
    const root = fixture(consumer)
    expectRun(root, consumer.name, 0, 1)
    rmSync(resolve(root, consumer.inputs[0]))
    expectRun(root, consumer.name, 1, 2)
  }, 30_000)
})

const skippedDirectories = new Set(['node_modules', '.next', '.expo', '.turbo', '.gradle', '.stryker-tmp', 'coverage',
  'dist', 'build', 'android', 'ios', 'target'])
const codeFile = /\.[cm]?[jt]sx?$/
const compiledFile = /\.(?:[cm]?tsx?|jsx)$/
const testOrSetupFile = /(?:^|\/)(?:__tests__|test-support|test-mocks|vitest)\/|\.test\.[cm]?[jt]sx?$|^vitest[^/]*\.config\.[cm]?[jt]s$/
const lintConfiguration = /(?:^|\/)eslint\.config\.[cm]?js$/
const resolutionSuffixes = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts',
  '/index.tsx', '/index.js']
const pathModules = new Set(['node:path', 'path'])
const urlModules = new Set(['node:url', 'url'])
const moduleCalls = new Set(['require', 'vi.mock', 'vi.doMock', 'vi.importActual'])
/**
 * An ESLint RuleTester `filename`, an `exemptFiles` rule option and a config lookup name a file only to match the
 * linted filename. ESLint lints the inline code and does not read that file.
 */
const virtualFilenameKeys = new Set(['filename', 'exemptFiles'])
const virtualFilenameCalls = new Set(['calculateConfigForFile', 'eslint.calculateConfigForFile'])
/**
 * Tests that build paths at run time from a folder walk or a computed list. The guard cannot follow the walk, so
 * each entry names the outside folders the test reads and the files it keeps there. Every kept file must be hashed.
 * An entry replaces the folder the guard computed for that test, so keep it in step with the test.
 */
const folderWalks = {
  'apps/web/__tests__/components/ui/list-row-icon-map.test.tsx': { folders: ['apps/mobile/app/', 'apps/mobile/components/'],
    files: /\.tsx$/ },
  // GENERATED_OUTPUTS lists the generator outputs, all in apps/mobile, and the literal check covers each one.
  'apps/mobile/__tests__/scripts/widget-color-generator.test.ts': { folders: [], files: /$^/ },
  'packages/shared/src/__tests__/authored-typography.test.ts': { folders: ['apps/mobile/', 'apps/web/'],
    files: /\.(?:tsx?|jsx?|css|xml|svg)$/ },
  'packages/shared/src/__tests__/backlog-port-source.test.ts': { folders: ['apps/mobile/', 'apps/web/'], files: /\.(?:css|tsx?)$/ },
  'packages/shared/src/__tests__/hermes-intl-guard.test.ts': { folders: ['apps/mobile/'], files: /\.[jt]sx?$/ },
  'packages/shared/src/__tests__/primitive-contracts.test.ts': { folders: ['apps/mobile/components/', 'apps/web/components/'],
    files: /\.[jt]sx?$/ },
  'packages/shared/src/__tests__/theme.test.ts': { folders: ['apps/mobile/', 'apps/web/'], files: /\.(?:css|tsx?)$/ },
}

let tracked
/** The files turbo can hash: tracked, or untracked and not ignored. Generated and installed files are left out. */
function hashableFiles() {
  if (!tracked) {
    const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    expect(result.status, `git ls-files failed: ${result.error ?? result.stderr}`).toBe(0)
    tracked = new Set(result.stdout.split('\0').filter(Boolean))
    expect(tracked.size, 'git ls-files listed no files').toBeGreaterThan(0)
  }
  return tracked
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile()
}

function isDirectory(file) {
  return existsSync(file) && statSync(file).isDirectory()
}

function repositoryPath(file) {
  return relative(repository, file).split(sep).join('/')
}

function codeFilesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skippedDirectories.has(entry.name)) return []
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) return codeFilesIn(file)
    return codeFile.test(entry.name) ? [file] : []
  })
}

function resolveFile(base, specifier) {
  const path = specifier.split('?')[0]
  return resolutionSuffixes.map((suffix) => resolve(base, path + suffix)).find(isFile)
}

function tsconfigChain(file, chain = []) {
  if (!isFile(file) || chain.includes(file)) return chain
  chain.push(file)
  const { config } = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'))
  const parents = [config?.extends ?? []].flat().filter((parent) => parent.startsWith('.'))
  for (const parent of parents) tsconfigChain(resolve(dirname(file), parent.endsWith('.json') ? parent : `${parent}.json`), chain)
  return chain
}

function nearestTsconfig(file) {
  for (let directory = dirname(file); directory.startsWith(repository); directory = dirname(directory)) {
    if (isFile(resolve(directory, 'tsconfig.json'))) return resolve(directory, 'tsconfig.json')
    if (directory === repository) return undefined
  }
  return undefined
}

let dryRun
function repositoryDryRun() {
  if (!dryRun) {
    const result = spawnSync(process.execPath, [turbo, 'run', 'test', '--dry=json'], { cwd: repository,
      encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TURBO_TELEMETRY_DISABLED: '1' } })
    expect(result.status, `turbo run test --dry=json failed: ${result.error ?? result.stderr}`).toBe(0)
    dryRun = JSON.parse(result.stdout)
  }
  return dryRun
}

function hashedFiles(taskId, tasks = repositoryDryRun().tasks, hashed = new Set()) {
  const task = tasks.find((entry) => entry.taskId === taskId)
  for (const input of Object.keys(task.inputs)) hashed.add(posix.normalize(posix.join(task.directory, input)))
  for (const dependency of task.dependencies) hashedFiles(dependency, tasks, hashed)
  return hashed
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (/\.[cm]?ts$/.test(file)) return ts.ScriptKind.TS
  return file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS
}

function directoryOf(prefix) {
  if (!prefix) return undefined
  return prefix.endsWith('/') ? prefix.slice(0, -1) || '/' : dirname(prefix)
}

const unknownValue = [{ prefix: '' }]
const valueLimit = 200
const iterationMethods = new Set(['map', 'flatMap', 'forEach', 'filter', 'some', 'every', 'find', 'findIndex'])
const runCall = /(?:^|\.)(?:exec|execFile|spawn|fork)(?:Sync)?$/

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

/**
 * Parses one module into its imports and the values of each path expression (a literal, a `node:path` or URL call,
 * `process.cwd()`, or an argument of a call that runs or imports a file). An identifier takes the values of its const
 * initializer, the literal table its loop, callback or `each` iterates, or the arguments at its function's call
 * sites. A value is `{ path }` or `{ url }` when known before the run, and `{ prefix }` when the run supplies a part.
 */
function moduleFacts(file, workspaceRoot) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, scriptKind(file))
  const fileDirectory = dirname(file)
  const pathFunctions = new Map()
  const urlFunctions = new Set()
  const repositoryRoots = new Set()
  const imports = []
  const expressions = []
  const calls = []
  const text = (node) => node.getText(source)
  const bind = (from, local, imported) => {
    if (pathModules.has(from)) pathFunctions.set(local, ['default', 'posix'].includes(imported) ? 'module' : imported)
    if (urlModules.has(from) && imported === 'fileURLToPath') urlFunctions.add(local)
    if (/repository-root(?:\.ts)?$/.test(from) && imported === 'repositoryRoot') repositoryRoots.add(local)
  }
  const requiredModule = (node) => node && ts.isCallExpression(node) && text(node.expression) === 'require' &&
    node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : undefined
  const virtual = (node) => {
    for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
      if (ts.isPropertyAssignment(parent) && parent.initializer === child && virtualFilenameKeys.has(text(parent.name))) return true
      if (ts.isCallExpression(parent) && parent.arguments.includes(child) && virtualFilenameCalls.has(text(parent.expression))) return true
      if (ts.isStatement(parent)) return false
    }
    return false
  }
  const runs = (node) => {
    for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
      if (ts.isCallExpression(parent) && parent.arguments.includes(child)) {
        return parent.expression.kind === ts.SyntaxKind.ImportKeyword || runCall.test(text(parent.expression))
      }
      if (!ts.isArrayLiteralExpression(parent) && !ts.isTemplateSpan(parent) && !ts.isTemplateExpression(parent)) return false
    }
    return false
  }
  const collect = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text
      imports.push(from)
      const clause = node.importClause
      if (clause?.name) bind(from, clause.name.text, 'default')
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) bind(from, bindings.name.text, 'default')
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) bind(from, element.name.text, (element.propertyName ?? element.name).text)
      }
      return
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text)
      return
    }
    if (ts.isCallExpression(node)) {
      calls.push(node)
      if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || moduleCalls.has(text(node.expression)))) {
        imports.push(node.arguments[0].text)
        for (const argument of node.arguments.slice(1)) collect(argument)
        return
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || runCall.test(text(node.expression))) {
        for (const argument of node.arguments) {
          const items = ts.isArrayLiteralExpression(argument) ? argument.elements : [argument]
          for (const item of items) if (ts.isIdentifier(item)) expressions.push(item)
        }
      }
    }
    if (ts.isVariableDeclaration(node)) {
      const from = requiredModule(node.initializer)
      if (from && ts.isIdentifier(node.name)) bind(from, node.name.text, 'default')
      if (from && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) bind(from, element.name.text, text(element.propertyName ?? element.name))
        }
      }
    }
    const pathLike = ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || ts.isCallExpression(node) ||
      (ts.isNewExpression(node) && text(node.expression) === 'URL')
    const propertyName = node.parent && (ts.isPropertyAssignment(node.parent) ||
      ts.isPropertyAccessExpression(node.parent)) && node.parent.name === node
    if (pathLike && !propertyName && !virtual(node)) expressions.push(node)
    ts.forEachChild(node, collect)
  }
  collect(source)

  const declares = (name, target) => {
    if (ts.isIdentifier(name)) return name.text === target ? name.parent : undefined
    for (const element of name.elements ?? []) {
      const found = !ts.isOmittedExpression(element) && declares(element.name, target)
      if (found) return found
    }
    return undefined
  }
  const declarationOf = (identifier) => {
    for (let scope = identifier.parent; scope; scope = scope.parent) {
      const declarations = []
      if (ts.isFunctionLike(scope)) declarations.push(...scope.parameters.map((parameter) => parameter.name))
      if ((ts.isForOfStatement(scope) || ts.isForStatement(scope) || ts.isForInStatement(scope)) &&
        scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
        declarations.push(...scope.initializer.declarations.map((declaration) => declaration.name))
      }
      for (const statement of scope.statements ?? []) {
        if (ts.isVariableStatement(statement)) declarations.push(...statement.declarationList.declarations.map(({ name }) => name))
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === identifier.text) {
          return statement
        }
        const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined
        if (clause?.name?.text === identifier.text) return clause
        const bindings = clause?.namedBindings
        if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === identifier.text) return bindings
        for (const element of bindings && ts.isNamedImports(bindings) ? bindings.elements : []) {
          if (element.name.text === identifier.text) return element
        }
      }
      for (const name of declarations) {
        const found = declares(name, identifier.text)
        if (found) return found
      }
    }
    return undefined
  }
  const evaluating = new Set()
  const guarded = (node, compute) => {
    if (evaluating.has(node)) return unknownValue
    evaluating.add(node)
    try {
      return compute()
    } finally {
      evaluating.delete(node)
    }
  }
  const initializerOf = (node) => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
      return initializerOf(node.expression)
    }
    if (!ts.isIdentifier(node)) return node
    const declaration = declarationOf(node)
    return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer &&
      declaration.parent.flags & ts.NodeFlags.Const ? initializerOf(declaration.initializer) : declaration
  }
  /** The keys of a literal object, or of the JSON file that a default import names. */
  const keysOf = (node) => {
    const object = initializerOf(node)
    if (object && ts.isObjectLiteralExpression(object)) {
      return object.properties.flatMap((property) => ts.isPropertyAssignment(property) &&
        (ts.isStringLiteralLike(property.name) || ts.isIdentifier(property.name)) ? [{ path: property.name.text }] : unknownValue)
    }
    const specifier = object && ts.isImportClause(object) ? object.parent.moduleSpecifier.text : undefined
    if (!specifier?.startsWith('.') || !specifier.endsWith('.json')) return unknownValue
    return Object.keys(JSON.parse(readFileSync(resolve(fileDirectory, specifier), 'utf8'))).map((key) => ({ path: key }))
  }
  const items = (node) => guarded(node, () => {
    const collection = initializerOf(node)
    if (collection && ts.isConditionalExpression(collection)) {
      return unique([...items(collection.whenTrue), ...items(collection.whenFalse)])
    }
    if (collection && ts.isArrayLiteralExpression(collection)) {
      return unique(collection.elements.flatMap((element) => {
        if (ts.isSpreadElement(element)) return items(element.expression)
        if (ts.isArrayLiteralExpression(element)) return element.elements[0] ? evaluate(element.elements[0]) : unknownValue
        return evaluate(element)
      }))
    }
    if (collection && ts.isCallExpression(collection) && ts.isPropertyAccessExpression(collection.expression)) {
      const method = text(collection.expression)
      if (['Object.keys', 'Object.entries'].includes(method) && collection.arguments[0]) {
        return unique(keysOf(collection.arguments[0]))
      }
      if (['filter', 'slice', 'toSorted', 'sort'].includes(collection.expression.name.text)) return items(collection.expression.expression)
    }
    return unknownValue
  })
  /** The values of one property across the literal objects of a literal array. */
  const propertyItems = (node, key) => guarded(node, () => {
    const collection = initializerOf(node)
    if (collection && ts.isConditionalExpression(collection)) {
      return unique([...propertyItems(collection.whenTrue, key), ...propertyItems(collection.whenFalse, key)])
    }
    if (!collection || !ts.isArrayLiteralExpression(collection)) return unknownValue
    return unique(collection.elements.flatMap((element) => {
      const object = initializerOf(element)
      const property = object && ts.isObjectLiteralExpression(object) &&
        object.properties.find((candidate) => candidate.name?.getText(source) === key)
      if (property && ts.isPropertyAssignment(property)) return evaluate(property.initializer)
      if (property && ts.isShorthandPropertyAssignment(property)) return evaluate(property.name)
      return unknownValue
    }))
  })
  /** The collection that a callback parameter or a `for...of` declaration takes its items from. */
  const collectionOf = (container) => {
    if (ts.isVariableDeclaration(container)) {
      return ts.isForOfStatement(container.parent.parent) ? container.parent.parent.expression : undefined
    }
    const owner = container.parent
    const call = owner.parent
    if (owner.parameters.indexOf(container) !== 0 || !ts.isCallExpression(call) || !call.arguments.includes(owner)) return undefined
    const callee = call.expression
    if (ts.isPropertyAccessExpression(callee) && iterationMethods.has(callee.name.text)) return callee.expression
    if (ts.isCallExpression(callee) && /\.each$/.test(text(callee.expression))) return callee.arguments[0]
    return undefined
  }
  const parameterValues = (parameter) => guarded(parameter, () => {
    const owner = parameter.parent
    const call = owner.parent
    if (ts.isCallExpression(call) && call.arguments.includes(owner)) {
      const collection = collectionOf(parameter)
      return collection ? items(collection) : unknownValue
    }
    const index = owner.parameters.indexOf(parameter)
    const name = ts.isFunctionDeclaration(owner) ? owner.name : ts.isVariableDeclaration(call) ? call.name : undefined
    if (!name || !ts.isIdentifier(name)) return unknownValue
    const sites = calls.filter((site) => ts.isIdentifier(site.expression) && site.expression.text === name.text)
    if (!sites.length) return unknownValue
    return unique(sites.flatMap((site) => site.arguments[index] ? evaluate(site.arguments[index]) : unknownValue))
  })
  const declarationValues = (declaration) => {
    if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration)) {
      return repositoryRoots.has(declaration.name.text) ? [{ path: repository }] : unknownValue
    }
    if (ts.isParameter(declaration)) return parameterValues(declaration)
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent
      const container = pattern.parent
      const collection = (ts.isParameter(container) || ts.isVariableDeclaration(container)) && collectionOf(container)
      if (!collection) return unknownValue
      if (ts.isObjectBindingPattern(pattern)) return propertyItems(collection, (declaration.propertyName ?? declaration.name).getText(source))
      return pattern.elements.indexOf(declaration) === 0 ? items(collection) : unknownValue
    }
    if (!ts.isVariableDeclaration(declaration)) return unknownValue
    if (ts.isForOfStatement(declaration.parent.parent)) return items(declaration.parent.parent.expression)
    return declaration.initializer && declaration.parent.flags & ts.NodeFlags.Const ? evaluate(declaration.initializer) : unknownValue
  }
  const pathCallee = (callee) => {
    if (ts.isIdentifier(callee)) {
      if (urlFunctions.has(callee.text)) return 'fileURLToPath'
      const name = pathFunctions.get(callee.text)
      return ['resolve', 'join', 'dirname'].includes(name) ? name : undefined
    }
    if (!ts.isPropertyAccessExpression(callee)) return undefined
    if (text(callee) === 'process.cwd') return 'cwd'
    const owner = callee.expression
    const module = (ts.isIdentifier(owner) && pathFunctions.get(owner.text) === 'module') ||
      (ts.isPropertyAccessExpression(owner) && owner.name.text === 'posix' && ts.isIdentifier(owner.expression) &&
        pathFunctions.get(owner.expression.text) === 'module')
    return module && ['resolve', 'join', 'dirname'].includes(callee.name.text) ? callee.name.text : undefined
  }
  const combinePath = (callee, parts) => {
    const unknown = parts.findIndex((part) => (part.url ?? part.path) === undefined)
    const known = parts.slice(0, unknown === -1 ? parts.length : unknown).map((part) => part.url ?? part.path)
    const base = callee === 'resolve' ? resolve(workspaceRoot, ...known) : known.length ? posix.join(...known) : ''
    if (unknown === -1) return { path: base }
    return { prefix: (base ? `${base.replace(/\/$/, '')}/` : '') + parts[unknown].prefix }
  }
  const evaluate = (node) => guarded(node, () => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)) return evaluate(node.expression)
    if (ts.isConditionalExpression(node)) return unique([...evaluate(node.whenTrue), ...evaluate(node.whenFalse)])
    if (ts.isStringLiteralLike(node)) return [{ path: node.text }]
    if (ts.isTemplateExpression(node)) {
      const parts = [[{ path: node.head.text }], ...node.templateSpans.flatMap((span) =>
        [evaluate(span.expression), [{ path: span.literal.text }]])]
      return product(parts, concatenate)
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return product([evaluate(node.left), evaluate(node.right)], concatenate)
    }
    if (ts.isIdentifier(node)) {
      if (node.text === '__dirname') return [{ path: fileDirectory }]
      if (node.text === '__filename') return [{ path: file }]
      const declaration = declarationOf(node)
      return declaration ? declarationValues(declaration) : unknownValue
    }
    if (ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression)) {
      if (node.name.text === 'dirname') return [{ path: fileDirectory }]
      if (node.name.text === 'filename') return [{ path: file }]
      if (node.name.text === 'url') return [{ url: file }]
    }
    if (ts.isNewExpression(node) && text(node.expression) === 'URL' && node.arguments?.length === 2) {
      return product([evaluate(node.arguments[0]), evaluate(node.arguments[1])], ([target, base]) => {
        if (base.url === undefined) return { prefix: '' }
        const directory = base.url.endsWith('/') ? base.url : `${dirname(base.url)}/`
        const known = target.url ?? target.path
        if (known === undefined) return { prefix: directory + target.prefix }
        return { url: resolve(directory, known) + (known.endsWith('/') ? '/' : '') }
      })
    }
    if (!ts.isCallExpression(node)) return unknownValue
    const callee = pathCallee(node.expression)
    if (callee === 'cwd') return [{ path: workspaceRoot }]
    if (!callee) return unknownValue
    const values = node.arguments.map(evaluate)
    if (callee === 'fileURLToPath') {
      return (values[0] ?? unknownValue).map((value) => value.url !== undefined ? { path: value.url } : value)
    }
    if (callee === 'dirname') {
      return (values[0] ?? unknownValue).map((value) => value.path !== undefined ? { path: dirname(value.path) } : { prefix: '' })
    }
    return product(values, (parts) => combinePath(callee, parts))
  })
  return {
    imports,
    paths: expressions.flatMap((node) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      const run = ts.isIdentifier(node) || runs(node)
      return evaluate(node).map((value) => ({ ...value, line, run }))
    }),
  }
}

/** The module specifiers of a workspace file that only its imports matter for: a scan, not a parse. */
function importsOf(file) {
  return ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles.map(({ fileName }) => fileName)
}

/**
 * The outside files a workspace's test runner reads, mapped to a reader: (a) the `tsconfig.json` chain of each
 * compiled file, (b) each workspace manifest whose `exports` a loaded module resolves, (c) each import or path in a
 * test or setup file that names an outside file, and the imports and paths of each outside module a test imports or
 * runs. `runtimeFolders` holds each known outside folder under which a test or setup file completes a path at run time.
 */
function outsideReads(workspace) {
  const workspaceRoot = resolve(repository, workspace)
  const inside = (file) => file === workspaceRoot || file.startsWith(workspaceRoot + sep)
  const manifests = new Map(repositoryDryRun().tasks.map(({ package: name, directory }) =>
    [name, resolve(repository, directory, 'package.json')]))
  const reads = new Map()
  const runtimeFolders = new Map()
  const loaded = []
  const read = (file, reader) => {
    if (!inside(file) && !reads.has(file) && hashableFiles().has(repositoryPath(file))) reads.set(file, reader)
  }
  const load = (file, reader) => {
    if (inside(file) || loaded.includes(file) || !hashableFiles().has(repositoryPath(file))) return
    read(file, reader)
    loaded.push(file)
  }
  const locate = (path, file, folder = false) => {
    if (!path || path.includes('://') || (!folder && !/[./]/.test(path))) return []
    if (isAbsolute(path)) return [path]
    const bases = path.startsWith('.') ? [dirname(file), workspaceRoot] : [workspaceRoot, repository]
    return bases.map((base) => resolve(base, path.split('?')[0]))
  }
  const followImports = (file, specifiers) => {
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        const target = resolveFile(dirname(file), specifier)
        if (target) load(target, repositoryPath(file))
        continue
      }
      const name = [...manifests.keys()].find((entry) => specifier === entry || specifier.startsWith(`${entry}/`))
      if (name) read(manifests.get(name), repositoryPath(file))
    }
  }
  const scan = (file, checksFolders) => {
    const { imports, paths } = moduleFacts(file, workspaceRoot)
    followImports(file, imports)
    for (const { path, url, prefix, line, run } of paths) {
      const reader = `${repositoryPath(file)}:${line}`
      const known = url ?? path
      if (known !== undefined) {
        const target = locate(known, file).find(isFile)
        if (target) (run && codeFile.test(target) ? load : read)(target, reader)
        continue
      }
      const folder = checksFolders && locate(directoryOf(prefix), file, true).find(isDirectory)
      const key = `${folder}\0${repositoryPath(file)}`
      if (folder && !inside(folder) && !runtimeFolders.has(key)) runtimeFolders.set(key, [folder, reader])
    }
  }
  for (const file of codeFilesIn(workspaceRoot)) {
    const path = relative(workspaceRoot, file).split(sep).join('/')
    if (lintConfiguration.test(path)) continue
    // This file names its fixture files with repository paths, but it writes and reads them in temporary roots.
    if (testOrSetupFile.test(path) && file !== import.meta.filename) scan(file, true)
    else followImports(file, importsOf(file))
  }
  for (let index = 0; index < loaded.length; index++) scan(loaded[index], false)
  const compiled = [...codeFilesIn(workspaceRoot), ...loaded].filter((file) => compiledFile.test(file))
  const configurations = new Map(compiled.toReversed().map((file) => [nearestTsconfig(file), file]))
  configurations.delete(undefined)
  for (const [configuration, user] of configurations) {
    for (const file of tsconfigChain(configuration)) {
      read(file, `the tsconfig chain of ${repositoryPath(configuration)}, which compiles ${repositoryPath(user)}`)
    }
  }
  return { reads, runtimeFolders }
}

describe('workspace test tasks hash every outside file their tests read', () => {
  const testTasks = () => repositoryDryRun().tasks.filter((task) => task.task === 'test' && task.command !== '<NONEXISTENT>')

  it('finds a test task for every workspace with a test script', () => {
    expect(testTasks().map(({ taskId }) => taskId).sort()).toEqual(['@orbit/desktop#test', '@orbit/eslint-rules#test',
      '@orbit/mobile#test', '@orbit/shared#test', '@orbit/web#test'])
  }, 30_000)

  // The names are workspace directories, so the `-t @orbit/desktop` run in the shared guard test above skips them.
  it.each(['apps/desktop', 'eslint-rules', 'apps/mobile', 'packages/shared', 'apps/web'])('%s', (directory) => {
    const { taskId } = testTasks().find((task) => task.directory === directory)
    const hashed = hashedFiles(taskId)
    const { reads, runtimeFolders } = outsideReads(directory)
    const unhashed = [...reads].map(([file, reader]) => [repositoryPath(file), reader])
      .filter(([path]) => !hashed.has(path)).map(([path, reader]) => `${path} (read by ${reader})`)
    for (const [folder, reader] of runtimeFolders.values()) {
      const prefix = folder === repository ? '' : `${repositoryPath(folder)}/`
      const walk = folderWalks[reader.replace(/:\d+$/, '')] ?? { folders: [prefix], files: /(?:)/ }
      const missing = [...hashableFiles()].filter((path) => walk.folders.some((root) => path.startsWith(root)) &&
        walk.files.test(path) && !hashed.has(path))
      if (missing.length) {
        unhashed.push(`${prefix || './'} (${reader} builds a path under this folder at run time. Name the file in the ` +
          `test, hash the folder, or add the walk to folderWalks: ${missing.length} files are not hashed, such as ${missing[0]})`)
      }
    }
    const readers = new Set([...runtimeFolders.values()].map(([, reader]) => reader.replace(/:\d+$/, '')))
    const stale = Object.keys(folderWalks).filter((reader) => reader.startsWith(`${directory}/`) && !readers.has(reader))
    expect(stale, 'remove each folderWalks entry whose test no longer walks a folder outside its workspace').toEqual([])
    expect(unhashed.sort(), `add a turbo.json input glob to ${taskId} for each file`).toEqual([])
  }, 60_000)
})
