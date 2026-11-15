import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync }
  from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, posix, relative, resolve, sep } from 'node:path'
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
    'tsconfig.json',
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
const importSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|importActual)\s*\(\s*)(['"`])([^'"`$\n]+)\1/g
const literalRun = /(?:(['"])[^'"\n]*\1\s*,\s*)*(['"])[^'"\n]*\2/g
const literal = /(['"])([^'"\n]*)\1/g
/**
 * An ESLint RuleTester `filename`, a config lookup and an `exemptFiles` rule option name a file only to match the
 * linted filename. ESLint lints the inline code and does not read that file.
 */
const virtualFilename = /(?:\bfilename:\s*(?:fileURLToPath\(\s*new URL\(\s*)?|\bcalculateConfigForFile\(\s*|\bexemptFiles:\s*\[\s*)$/

let tracked
/** The files turbo can hash: tracked, or untracked and not ignored. Generated and installed files are left out. */
function hashableFiles() {
  tracked ??= new Set(spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\0').filter(Boolean))
  return tracked
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile()
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
  dryRun ??= JSON.parse(spawnSync(process.execPath, [turbo, 'run', 'test', '--dry=json'], { cwd: repository,
    encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TURBO_TELEMETRY_DISABLED: '1' } }).stdout)
  return dryRun
}

function hashedFiles(taskId, tasks = repositoryDryRun().tasks, hashed = new Set()) {
  const task = tasks.find((entry) => entry.taskId === taskId)
  for (const input of Object.keys(task.inputs)) hashed.add(posix.normalize(posix.join(task.directory, input)))
  for (const dependency of task.dependencies) hashedFiles(dependency, tasks, hashed)
  return hashed
}

/**
 * The files outside a workspace that its test runner reads: every relative import that leaves the workspace and
 * every path literal in a test or setup file that names a file outside it, the transitive relative imports of
 * each such module, each workspace package manifest whose `exports` a loaded module resolves, and the
 * `tsconfig.json` chain that Vite's native transform applies to each compiled file.
 */
function outsideReads(workspace) {
  const workspaceRoot = resolve(repository, workspace)
  const inside = (file) => file === workspaceRoot || file.startsWith(workspaceRoot + sep)
  const manifests = new Map(repositoryDryRun().tasks.map(({ package: name, directory }) =>
    [name, resolve(repository, directory, 'package.json')]))
  const reads = new Map()
  const loaded = []
  const read = (file, reader) => {
    if (!inside(file) && !reads.has(file) && hashableFiles().has(repositoryPath(file))) reads.set(file, reader)
  }
  const load = (file, reader) => {
    if (inside(file) || reads.has(file)) return
    read(file, reader)
    loaded.push(file)
  }
  const scanImports = (file, source) => {
    for (const [, , specifier] of source.matchAll(importSpecifier)) {
      if (specifier.startsWith('.')) {
        const target = resolveFile(dirname(file), specifier)
        if (target) load(target, repositoryPath(file))
        continue
      }
      const name = [...manifests.keys()].find((entry) => specifier === entry || specifier.startsWith(`${entry}/`))
      if (name) read(manifests.get(name), repositoryPath(file))
    }
  }
  for (const file of codeFilesIn(workspaceRoot)) {
    const path = relative(workspaceRoot, file).split(sep).join('/')
    if (lintConfiguration.test(path)) continue
    const source = readFileSync(file, 'utf8')
    scanImports(file, source)
    // This file names its fixture files with repository paths, but it writes and reads them in temporary roots.
    if (!testOrSetupFile.test(path) || file === import.meta.filename) continue
    for (const { 0: run, index } of source.matchAll(literalRun)) {
      if (virtualFilename.test(source.slice(Math.max(0, index - 60), index))) continue
      const parts = [...run.matchAll(literal)].map(([, , text]) => text)
      for (const candidate of new Set([...parts, parts.join('/')])) {
        if (!/[./]/.test(candidate) || candidate.includes('://')) continue
        const bases = candidate.startsWith('.') ? [dirname(file), workspaceRoot] : [workspaceRoot, repository]
        const target = bases.map((base) => resolve(base, candidate.split('?')[0])).find(isFile)
        if (target) read(target, repositoryPath(file))
      }
    }
  }
  for (let index = 0; index < loaded.length; index++) {
    const file = loaded[index]
    const source = readFileSync(file, 'utf8')
    scanImports(file, source)
    for (const [, , text] of source.matchAll(literal)) {
      const target = text.startsWith('.') && codeFile.test(text) ? resolveFile(dirname(file), text) : undefined
      if (target) load(target, repositoryPath(file))
    }
  }
  const compiled = [...codeFilesIn(workspaceRoot), ...loaded].filter((file) => compiledFile.test(file))
  for (const configuration of new Set(compiled.map(nearestTsconfig).filter(Boolean))) {
    for (const file of tsconfigChain(configuration)) read(file, `the tsconfig chain of ${repositoryPath(configuration)}`)
  }
  return reads
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
    const unhashed = [...outsideReads(directory)].map(([file, reader]) => [repositoryPath(file), reader])
      .filter(([path]) => !hashed.has(path)).map(([path, reader]) => `${path} (read by ${reader})`).sort()
    expect(unhashed, `add a turbo.json input glob to ${taskId} for each file`).toEqual([])
  }, 30_000)
})
