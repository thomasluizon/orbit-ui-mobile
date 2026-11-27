import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import yaml from 'js-yaml'

const load = (name) => yaml.load(readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8'))
const workflow = load('desktop-build.yml')
const acceptance = load('desktop-acceptance.yml')
const producers = load('desktop-acceptance-producers.yml')

test('desktop installs Rust before selecting the default without depending on a new rustup flag', () => {
  const install = workflow.jobs.build.steps.find((step) => step.name === 'Install Rust and compilation target')
  assert.deepEqual(install.run.trim().split('\n'), [
    'rustup toolchain install stable --profile minimal --target "$DESKTOP_TARGET"',
    'rustup default stable',
  ])
})

const all = ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc']
const git = (directory, ...arguments_) => execFileSync('git', arguments_, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })

// Runs the select step of a plan job on a repository with one base commit and one change commit, as a pull request checkout sees it.
function selected(step, { event = 'pull_request', hit = '', change = () => {} }) {
  const directory = mkdtempSync(join(tmpdir(), 'desktop-plan-'))
  const repository = join(directory, 'repository')
  try {
    mkdirSync(join(repository, 'apps/desktop/src-tauri/src'), { recursive: true })
    git(repository, 'init', '-q')
    git(repository, 'config', 'user.email', 'test@example.invalid')
    git(repository, 'config', 'user.name', 'Test')
    writeFileSync(join(repository, 'apps/desktop/src-tauri/src/main.rs'), 'fn main() {}\n')
    writeFileSync(join(repository, 'package-lock.json'), '{}\n')
    git(repository, 'add', '.')
    git(repository, 'commit', '-qm', 'base')
    change(repository)
    git(repository, 'add', '-A')
    git(repository, 'commit', '-qm', 'change')
    const output = join(directory, 'output')
    const result = spawnSync('bash', ['-e', '-c', step.run], {
      cwd: repository, env: { ...process.env, RUNNER_TEMP: directory, GITHUB_OUTPUT: output, GITHUB_EVENT_NAME: event, PASS_HIT: hit }, encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    return Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
const write = (path) => (repository) => {
  mkdirSync(dirname(join(repository, path)), { recursive: true })
  writeFileSync(join(repository, path), 'changed\n')
}
const decision = (plan, options) => {
  const { run, matrix } = selected(plan.steps.find((step) => step.id === 'select'), options)
  return { run, matrix: JSON.parse(matrix) }
}

test('a pull request compiles the Apple Silicon target alone, and only for a change to the shell or this workflow', () => {
  const { plan, build } = workflow.jobs
  assert.equal(workflow.jobs.targets, undefined)
  assert.equal(plan.if, undefined, 'the plan job runs for every event, so no workflow path filter hides a skip')
  assert.equal(build.needs, 'plan')
  assert.equal(build.if, "needs.plan.outputs.run == 'true'")
  assert.equal(build.strategy.matrix.target, '${{ fromJSON(needs.plan.outputs.matrix) }}')
  const native = ['aarch64-apple-darwin']
  const run = (change, extra = {}) => decision(plan, { change, ...extra })
  assert.deepEqual(run(write('apps/desktop/src-tauri/src/main.rs')), { run: 'true', matrix: native })
  assert.deepEqual(run(write('apps/desktop/src-tauri/native/windows/downloads.json')), { run: 'true', matrix: native })
  assert.deepEqual(run(write('.github/workflows/desktop-build.yml')), { run: 'true', matrix: native })
  assert.equal(run(write('apps/desktop/README.md')).run, 'false', 'a Markdown file in the shell changes no build')
  assert.equal(run(write('package-lock.json')).run, 'false', 'the root manifests start no desktop build of a pull request')
  assert.equal(run(write('package.json')).run, 'false')
  assert.equal(run(write('tools/desktop-bench/acceptance.mjs')).run, 'false')
  assert.equal(run(write('apps/web/app/page.tsx')).run, 'false')
  assert.equal(run(write('apps/desktop/src-tauri/src/main.rs'), { hit: 'true' }).run, 'false', 'a pass for the same inputs skips the build')
  assert.equal(run(write('apps/desktop/src-tauri/src/main.rs'), { hit: 'false' }).run, 'true')
  assert.equal(run((repository) => {
    mkdirSync(join(repository, 'docs'))
    git(repository, 'mv', 'apps/desktop/src-tauri/src/main.rs', 'docs/main.rs')
  }).run, 'true', 'a file that leaves the shell still compiles')
})

test('a push to main and a dispatch compile all four targets, also when a pass exists', () => {
  const { plan } = workflow.jobs
  for (const event of ['push', 'workflow_dispatch']) {
    assert.deepEqual(decision(plan, { event, hit: 'true', change: write('package-lock.json') }), { run: 'true', matrix: all }, event)
  }
  const lookup = plan.steps.find((step) => step.id === 'pass')
  assert.equal(lookup.if, "github.event_name == 'pull_request'", 'main reads no pass, because its run saves the Rust caches')
  assert.equal(workflow.on.pull_request.paths, undefined, 'a path filter on pull_request would leave the check absent')
  assert.equal(workflow.on.push.paths.includes('package-lock.json'), true, 'a lockfile change on main saves the Windows npm cache')
})

test('the plan hashes the shell inputs, and a passing run saves the marker that the plan reads', () => {
  const { plan, record } = workflow.jobs
  const key = plan.steps.find((step) => step.id === 'key').run
  assert.match(key, /desktop-build-pass-v1-/)
  assert.match(key, /hashFiles\('apps\/desktop\/\*\*', '!apps\/desktop\/\*\*\/\*\.md', '\.github\/workflows\/desktop-build\.yml'\)/)
  assert.doesNotMatch(key, /package/, 'the root manifests are no input of the pull request build')
  const lookup = plan.steps.find((step) => step.id === 'pass')
  assert.equal(lookup.with.key, '${{ steps.key.outputs.value }}')
  assert.equal(lookup.with['lookup-only'], true)
  assert.equal(lookup.with.path, '.ci-pass/desktop-macos')
  assert.deepEqual(record.needs, ['plan', 'build'])
  assert.equal(record.steps.at(-1).with.key, '${{ needs.plan.outputs.pass-key }}')
  assert.equal(record.steps.at(-1).with.path, '.ci-pass/desktop-macos')
})

test('installed (windows-latest) runs the Windows x86 build, the desktop tests and the producer tests, and records a pass', () => {
  const { plan, installed, record } = acceptance.jobs
  assert.equal(acceptance.on.pull_request.paths, undefined, 'a path filter on pull_request would leave the check absent')
  assert.equal(installed.name, 'installed (windows-latest)')
  assert.equal(installed.needs, 'plan')
  assert.equal(installed.if, "needs.plan.outputs.run == 'true'")
  const names = installed.steps.map((step) => step.name ?? step.uses)
  const at = (name) => names.indexOf(name)
  for (const name of ['Run the platform-gated producer tests', 'Test the desktop shell', 'Test native context on the runner host', 'Package unsigned staging shell']) {
    assert.ok(at(name) >= 0, name)
  }
  assert.ok(at('Provide the NSIS bundler tools') < at('Package unsigned staging shell'))
  assert.ok(at('Package unsigned staging shell') < at('Build, install and exercise the isolated desktop app'))
  const step = (name) => installed.steps.find((candidate) => candidate.name === name)
  assert.equal(step('Test the desktop shell').run, 'npm run test -w @orbit/desktop')
  assert.equal(step('Test native context on the runner host').run, 'cargo test --locked')
  assert.equal(step('Package unsigned staging shell').run, 'npm run build:staging -w @orbit/desktop -- --target x86_64-pc-windows-msvc --no-sign -- --locked')
  assert.deepEqual(step('Run the platform-gated producer tests').run.trim().split('\n'), [
    'node --import tsx tools/desktop-bench/test-acceptance.ts',
    'node --import tsx tools/desktop-bench/test-acceptance-push.ts',
    'node --import tsx tools/desktop-bench/test-acceptance-readers.ts',
    'node --import tsx tools/desktop-bench/test-acceptance-launch.ts',
  ])
  const downloads = step('Cache Windows App SDK downloads')
  assert.equal(downloads.uses, 'actions/cache/restore@v6', 'only Desktop Build on main saves the download cache')
  assert.equal(downloads.with.key, "${{ runner.os }}-windows-app-sdk-x86_64-pc-windows-msvc-${{ hashFiles('apps/desktop/src-tauri/native/windows/downloads.json') }}")
  assert.ok(at('Point the Windows App SDK download cache') < at('Cache Windows App SDK downloads'))
  assert.deepEqual(record.needs, ['plan', 'installed'])
  assert.equal(record.steps.at(-1).with.key, '${{ needs.plan.outputs.pass-key }}')
  assert.equal(record.steps.at(-1).with.path, '.ci-pass/desktop-windows')
  assert.match(plan.steps.find((candidate) => candidate.id === 'key').run, /desktop-windows-pass-v1-/)
})

test('the Windows job runs for a change to a file that it reads, and not for Markdown, unrelated files or a recorded pass', () => {
  const { plan } = acceptance.jobs
  const run = (change, options = {}) => selected(plan.steps.find((step) => step.id === 'select'), { change, ...options }).run
  for (const path of [
    'apps/desktop/src-tauri/src/main.rs', 'apps/desktop/__tests__/release.test.ts', 'tools/desktop-bench/test-acceptance.ts',
    'tools/desktop-bench/__fixtures__/stream.json', 'package.json', 'package-lock.json', '.github/actions/desktop-acceptance-setup/action.yml',
    '.github/actions/desktop-nsis-tools/action.yml', '.github/workflows/desktop-acceptance.yml',
  ]) assert.equal(run(write(path)), 'true', path)
  for (const path of ['apps/desktop/README.md', 'tools/desktop-bench/README.md', 'apps/web/app/page.tsx', 'tools/check-dashes.mjs', '.github/workflows/test.yml']) {
    assert.equal(run(write(path)), 'false', path)
  }
  assert.equal(run(write('apps/desktop/src-tauri/src/main.rs'), { hit: 'true' }), 'false')
  assert.equal(run(write('apps/web/app/page.tsx'), { event: 'push' }), 'true', 'a push to main with no pass runs the job')
  assert.equal(run(write('apps/web/app/page.tsx'), { event: 'push', hit: 'true' }), 'false', 'a push to main with a pass skips the job')
  assert.equal(run(write('apps/web/app/page.tsx'), { event: 'workflow_dispatch', hit: 'true' }), 'true')
})

test('only a push to main or a dispatch starts the macOS jobs', () => {
  assert.equal(acceptance.jobs['installed-signed'].if, "github.event_name != 'pull_request'")
  assert.equal(producers.on.pull_request, undefined)
  assert.deepEqual(producers.on.push.branches, ['main'])
  assert.deepEqual(producers.jobs.native.strategy.matrix.runner, ['macos-latest'])
  assert.equal(producers.jobs.native.name, 'producers (${{ matrix.runner }})')
  assert.deepEqual(acceptance.on.push.branches, ['main'])
  for (const concurrency of [acceptance.concurrency, producers.concurrency]) {
    assert.match(concurrency.group, /github\.run_id/, 'a main run never shares a group with another main run')
  }
})
