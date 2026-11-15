import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { repositoryRoot as repository } from '../src/test-support/repository-root.ts'
import { moduleFacts, ts } from './lib/path-values.mjs'

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
    'design/brand/orbit-mascot-feliz.svg', 'design/brand/orbit-lockup.svg', 'DESIGN.md',
    '.gitignore', 'apps/mobile/.gitignore', 'eslint-rules/no-comments.cjs', 'tsconfig.base.json',
    'evals/astra/catalog.yaml',
  ] },
  { workspace: 'apps/desktop', name: '@orbit/desktop', inputs: [
    '.github/workflows/desktop-release.yml', '.github/workflows/desktop-acceptance.yml',
    'apps/web/components/auth/desktop-auth-bridge.tsx',
    'apps/web/lib/desktop-push.ts', 'apps/web/lib/desktop-updates.ts',
    '.github/workflows/desktop-build.yml', '.github/workflows/release.yml',
    'apps/mobile/lib/turnstile-frames.ts', 'apps/web/proxy.ts', 'apps/web/web-compatibility.json',
    'apps/web/test-support/hermetic/mock-api/fixtures/chat-stream.ts', 'design/brand/orbit-mascot-small.svg',
    'design/brand/orbit-mascot.svg', 'packages/shared/src/chat/stream-turn.ts', 'tools/desktop-bench/probe.js',
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
  write(root, `${consumer.workspace}/scripts/lib/path-values.mjs`,
    readFileSync(resolve(import.meta.dirname, 'lib/path-values.mjs'), 'utf8'))
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
/**
 * Tests that build paths at run time from a folder walk or a computed list. The guard cannot follow the walk, so
 * each entry names the outside folders the test reads and the files it keeps there. Every kept file must be hashed.
 * An entry replaces the folder the guard computed for that test, so keep it in step with the test.
 */
const folderWalks = {
  'apps/web/__tests__/components/ui/list-row-icon-map.test.tsx': { folders: ['apps/mobile/app/', 'apps/mobile/components/'],
    files: /\.tsx$/ },
  'apps/web/__tests__/components/ui/skeleton-source-sweep.test.ts': { folders: ['apps/mobile/app/', 'apps/mobile/components/'],
    files: /\.tsx$/ },
  // GENERATED_OUTPUTS names the generator outputs, which are all in apps/mobile.
  'apps/mobile/__tests__/scripts/widget-color-generator.test.ts': { folders: ['apps/mobile/'], files: /(?:)/ },
  'packages/shared/src/__tests__/authored-typography.test.ts': { folders: ['apps/mobile/', 'apps/web/'],
    files: /\.(?:tsx?|jsx?|css|xml|svg)$/ },
  'packages/shared/src/__tests__/backlog-port-source.test.ts': { folders: ['apps/mobile/', 'apps/web/'], files: /\.(?:css|tsx?)$/ },
  'packages/shared/src/__tests__/brand-paths.test.ts': { folders: ['design/brand/'], files: /^design\/brand\/[^/]+\.svg$/ },
  'packages/shared/src/__tests__/design-primitives-kit.test.ts': { folders: ['apps/mobile/', 'apps/web/'], files: /\.tsx$/ },
  'packages/shared/src/__tests__/hermes-intl-guard.test.ts': { folders: ['apps/mobile/'], files: /\.[jt]sx?$/ },
  'packages/shared/src/__tests__/primitive-contracts.test.ts': { folders: ['apps/mobile/components/', 'apps/web/components/'],
    files: /\.[jt]sx?$/ },
  'packages/shared/src/__tests__/theme.test.ts': { folders: ['apps/mobile/', 'apps/web/'], files: /\.(?:css|tsx?)$/ },
}

let hashable
/**
 * The files turbo can hash (tracked, or untracked and not ignored) and their folders. Generated and installed files
 * are left out. The guard looks paths up here instead of on disk.
 */
function hashableFiles() {
  if (!hashable) {
    const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    expect(result.status, `git ls-files failed: ${result.error ?? result.stderr}`).toBe(0)
    const files = new Set(result.stdout.split('\0').filter(Boolean))
    expect(files.size, 'git ls-files listed no files').toBeGreaterThan(0)
    const folders = new Set([...files].flatMap((path) => path.split('/').slice(0, -1).map((_, index, parts) =>
      parts.slice(0, index + 1).join('/'))))
    hashable = { files, folders }
  }
  return hashable
}

function repositoryPath(file) {
  return relative(repository, file).split(sep).join('/')
}

const isHashableFile = (file) => hashableFiles().files.has(repositoryPath(file))
const isHashableFolder = (folder) => folder === repository || hashableFiles().folders.has(repositoryPath(folder))

const workspaceFiles = new Map()
function codeFilesIn(directory) {
  if (!workspaceFiles.has(directory)) {
    workspaceFiles.set(directory, readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (skippedDirectories.has(entry.name)) return []
      const file = resolve(directory, entry.name)
      if (entry.isDirectory()) return codeFilesIn(file)
      return codeFile.test(entry.name) ? [file] : []
    }))
  }
  return workspaceFiles.get(directory)
}

function resolveFile(base, specifier) {
  const path = specifier.split('?')[0]
  return resolutionSuffixes.map((suffix) => resolve(base, path + suffix)).find(isHashableFile)
}

function tsconfigChain(file, chain = []) {
  if (!isHashableFile(file) || chain.includes(file)) return chain
  chain.push(file)
  const { config } = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'))
  const parents = [config?.extends ?? []].flat().filter((parent) => parent.startsWith('.'))
  for (const parent of parents) tsconfigChain(resolve(dirname(file), parent.endsWith('.json') ? parent : `${parent}.json`), chain)
  return chain
}

function nearestTsconfig(file) {
  for (let directory = dirname(file); directory.startsWith(repository); directory = dirname(directory)) {
    if (isHashableFile(resolve(directory, 'tsconfig.json'))) return resolve(directory, 'tsconfig.json')
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

function directoryOf(prefix) {
  if (!prefix) return undefined
  return prefix.endsWith('/') ? prefix.slice(0, -1) || '/' : dirname(prefix)
}

/** The module specifiers of a workspace file that only its imports matter for: a scan, not a parse. */
function importsOf(file) {
  return ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles.map(({ fileName }) => fileName)
}

/** The state of one workspace scan: the outside files read, the run-time folders, and the outside modules loaded. */
function workspaceScan(workspace) {
  const workspaceRoot = resolve(repository, workspace)
  return { workspaceRoot, reads: new Map(), runtimeFolders: new Map(), loaded: [], loadedSet: new Set(),
    manifests: new Map(repositoryDryRun().tasks.map(({ package: name, directory }) =>
      [name, resolve(repository, directory, 'package.json')])) }
}

const isInside = (scan, file) => file === scan.workspaceRoot || file.startsWith(scan.workspaceRoot + sep)

function recordRead(scan, file, reader) {
  if (!isInside(scan, file) && !scan.reads.has(file) && isHashableFile(file)) scan.reads.set(file, reader)
}

function recordLoad(scan, file, reader) {
  if (isInside(scan, file) || scan.loadedSet.has(file) || !isHashableFile(file)) return
  recordRead(scan, file, reader)
  scan.loaded.push(file)
  scan.loadedSet.add(file)
}

/** The candidate locations of a path: as given when absolute, else from the file, the workspace or the repository. */
function locate(scan, path, file, folder = false) {
  if (!path || path.includes('://') || (!folder && !/[./]/.test(path))) return []
  if (isAbsolute(path)) return [path]
  const bases = path.startsWith('.') ? [dirname(file), scan.workspaceRoot] : [scan.workspaceRoot, repository]
  return bases.map((base) => resolve(base, path.split('?')[0]))
}

function followImports(scan, file, specifiers) {
  for (const specifier of specifiers) {
    if (specifier.startsWith('.')) {
      const target = resolveFile(dirname(file), specifier)
      if (target) recordLoad(scan, target, repositoryPath(file))
      continue
    }
    const name = [...scan.manifests.keys()].find((entry) => specifier === entry || specifier.startsWith(`${entry}/`))
    if (name) recordRead(scan, scan.manifests.get(name), repositoryPath(file))
  }
}

/** Parses a test, setup or loaded module and records each outside file or run-time folder its paths name. */
function scanModule(scan, file, checksFolders) {
  const { imports, paths } = moduleFacts({ file, workspaceRoot: scan.workspaceRoot, repository })
  followImports(scan, file, imports)
  for (const { path, url, prefix, line, run } of paths) {
    const known = url ?? path
    if (known === undefined && (!checksFolders || !prefix)) continue
    const reader = `${repositoryPath(file)}:${line}`
    if (known !== undefined) {
      const target = locate(scan, known, file).find(isHashableFile)
      if (target) (run && codeFile.test(target) ? recordLoad : recordRead)(scan, target, reader)
      continue
    }
    const folder = locate(scan, directoryOf(prefix), file, true).find(isHashableFolder)
    const key = `${folder}\0${repositoryPath(file)}`
    if (folder && !isInside(scan, folder) && !scan.runtimeFolders.has(key)) scan.runtimeFolders.set(key, [folder, reader])
  }
}

/** Records the `tsconfig.json` chain that Vite or esbuild applies to each compiled workspace or loaded file. */
function readTsconfigChains(scan) {
  const compiled = [...codeFilesIn(scan.workspaceRoot), ...scan.loaded].filter((file) => compiledFile.test(file))
  const configurations = new Map(compiled.toReversed().map((file) => [nearestTsconfig(file), file]))
  configurations.delete(undefined)
  for (const [configuration, user] of configurations) {
    for (const file of tsconfigChain(configuration)) {
      recordRead(scan, file, `the tsconfig chain of ${repositoryPath(configuration)}, which compiles ${repositoryPath(user)}`)
    }
  }
}

/**
 * The outside files a workspace's test runner reads, mapped to a reader: (a) the `tsconfig.json` chain of each
 * compiled file, (b) each workspace manifest whose `exports` a loaded module resolves, (c) each import or path in a
 * test or setup file that names an outside file, and the imports and paths of each outside module a test imports or
 * runs. `runtimeFolders` holds each known outside folder under which a test or setup file completes a path at run time.
 */
function outsideReads(workspace) {
  const scan = workspaceScan(workspace)
  for (const file of codeFilesIn(scan.workspaceRoot)) {
    const path = relative(scan.workspaceRoot, file).split(sep).join('/')
    if (lintConfiguration.test(path)) continue
    // This file names its fixture files with repository paths, but it writes and reads them in temporary roots.
    if (testOrSetupFile.test(path) && file !== import.meta.filename) scanModule(scan, file, true)
    else followImports(scan, file, importsOf(file))
  }
  for (let index = 0; index < scan.loaded.length; index++) scanModule(scan, scan.loaded[index], false)
  readTsconfigChains(scan)
  return scan
}

/** One line for each outside file the task does not hash, and for each run-time folder with a file it does not hash. */
function unhashedReads(directory, hashed) {
  const { reads, runtimeFolders } = outsideReads(directory)
  const unhashed = [...reads].map(([file, reader]) => [repositoryPath(file), reader])
    .filter(([path]) => !hashed.has(path)).map(([path, reader]) => `${path} (read by ${reader})`)
  for (const [folder, reader] of runtimeFolders.values()) {
    const prefix = folder === repository ? '' : `${repositoryPath(folder)}/`
    const walk = folderWalks[reader.replace(/:\d+$/, '')] ?? { folders: [prefix], files: /(?:)/ }
    const missing = [...hashableFiles().files].filter((path) => walk.folders.some((root) => path.startsWith(root)) &&
      walk.files.test(path) && !hashed.has(path))
    if (missing.length) {
      unhashed.push(`${prefix || './'} (${reader} builds a path under this folder at run time. Name the file in the ` +
        `test, hash the folder, or add the walk to folderWalks: ${missing.length} files are not hashed, such as ${missing[0]})`)
    }
  }
  const readers = new Set([...runtimeFolders.values()].map(([, reader]) => reader.replace(/:\d+$/, '')))
  const stale = Object.keys(folderWalks).filter((reader) => reader.startsWith(`${directory}/`) && !readers.has(reader))
  return { unhashed: unhashed.sort(), stale }
}

describe('the path evaluator of the turbo input guard', () => {
  const workspaceRoot = resolve(repository, 'apps/web')
  const file = resolve(workspaceRoot, '__tests__/probe.test.ts')
  const normalized = ({ path, url, prefix, run }) => {
    const known = url ?? path
    if (known !== undefined) return { path: isAbsolute(known) ? repositoryPath(known) : known, run }
    return { prefix: isAbsolute(prefix) ? `${repositoryPath(resolve(prefix))}/` : prefix, run }
  }
  const valuesOf = (source) => moduleFacts({ file, source, workspaceRoot, repository }).paths
    .filter(({ path, url, prefix }) => (url ?? path ?? prefix) !== '').map(normalized)
  const header = "import { readFileSync } from 'node:fs'\nimport { join, resolve } from 'node:path'\n" +
    "import { execFileSync } from 'node:child_process'\nimport { repositoryRoot } from '../test-support/repository-root'\n"

  it.each([
    ['a literal', "readFileSync('../../desktop/locales/en.json')", { path: '../../desktop/locales/en.json', run: false }],
    ['new URL', "readFileSync(new URL('../../desktop/locales/en.json', import.meta.url))",
      { path: 'apps/desktop/locales/en.json', run: false }],
    ['join segments', "readFileSync(join(repositoryRoot, 'apps', 'desktop', 'locales', 'en.json'))",
      { path: 'apps/desktop/locales/en.json', run: false }],
    ['a template with a const part', "const name = 'en'\nreadFileSync(resolve(process.cwd(), `../desktop/locales/${name}.json`))",
      { path: 'apps/desktop/locales/en.json', run: false }],
    ['a const folder', "const shell = resolve(process.cwd(), '../desktop')\nreadFileSync(resolve(shell, 'locales/en.json'))",
      { path: 'apps/desktop/locales/en.json', run: false }],
    ['a helper parameter', "const read = (name: string) => readFileSync(join(repositoryRoot, 'apps/desktop/locales', name))\n" +
      "read('en.json')", { path: 'apps/desktop/locales/en.json', run: false }],
    ['an each table', "it.each(['en.json'])('%s', (name) => readFileSync(join(repositoryRoot, 'apps/desktop/locales', name)))",
      { path: 'apps/desktop/locales/en.json', run: false }],
    ['a spawned script', "execFileSync(process.execPath, [join(repositoryRoot, 'tools', 'arch-map.mjs')])",
      { path: 'tools/arch-map.mjs', run: true }],
    ['a part known only at run time', "readFileSync(resolve(process.cwd(), `../desktop/locales/${String(Date.now())}.json`))",
      { prefix: 'apps/desktop/locales/', run: false }],
  ])('finds the path in %s', (_, source, expected) => {
    expect(valuesOf(header + source)).toContainEqual(expected)
  })
})

describe('workspace test tasks hash every outside file their tests read', () => {
  const testTasks = () => repositoryDryRun().tasks.filter((task) => task.task === 'test' && task.command !== '<NONEXISTENT>')

  it('finds a test task for every workspace with a test script', () => {
    expect(testTasks().map(({ taskId }) => taskId).sort()).toEqual(['@orbit/desktop#test', '@orbit/eslint-rules#test',
      '@orbit/mobile#test', '@orbit/shared#test', '@orbit/web#test'])
  }, 30_000)

  // The names are workspace directories, so the `-t @orbit/desktop` run in the shared guard test above skips them.
  it.each(['apps/desktop', 'eslint-rules', 'apps/mobile', 'packages/shared', 'apps/web'])('%s', (directory) => {
    const { taskId } = testTasks().find((task) => task.directory === directory)
    const { unhashed, stale } = unhashedReads(directory, hashedFiles(taskId))
    expect(stale, 'remove each folderWalks entry whose test no longer walks a folder outside its workspace').toEqual([])
    expect(unhashed, `add a turbo.json input glob to ${taskId} for each file`).toEqual([])
  }, 60_000)
})
