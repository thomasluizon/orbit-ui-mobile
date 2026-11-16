import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import yaml from 'js-yaml'

const workflow = yaml.load(readFileSync(new URL('../workflows/desktop-build.yml', import.meta.url), 'utf8'))

test('desktop installs Rust before selecting the default without depending on a new rustup flag', () => {
  const install = workflow.jobs.build.steps.find((step) => step.name === 'Install Rust and compilation target')
  assert.deepEqual(install.run.trim().split('\n'), [
    'rustup toolchain install stable --profile minimal --target "$DESKTOP_TARGET"',
    'rustup default stable',
  ])
})

test('a pull request that changes the shell compiles all four targets, and a manifest-only pull request compiles the native two', () => {
  const all = ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc']
  const native = ['aarch64-apple-darwin', 'x86_64-pc-windows-msvc']
  const { targets, build } = workflow.jobs
  assert.equal(targets.if, "github.event_name == 'pull_request'")
  assert.equal(build.needs, 'targets')
  assert.equal(build.if, '${{ !cancelled() }}', 'a push, a dispatch and a failed selection still compile')
  assert.equal(build.strategy.matrix.target, `\${{ fromJSON(needs.targets.outputs.matrix || '${JSON.stringify(all).replaceAll(',', ', ')}') }}`)
  const select = targets.steps.find((step) => step.id === 'select')
  const git = (directory, ...arguments_) => execFileSync('git', arguments_, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  const selected = (change) => {
    const directory = mkdtempSync(join(tmpdir(), 'desktop-targets-'))
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
      const result = spawnSync('bash', ['-e', '-c', select.run], {
        cwd: repository, env: { ...process.env, RUNNER_TEMP: directory, GITHUB_OUTPUT: output }, encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      return JSON.parse(readFileSync(output, 'utf8').trim().replace(/^matrix=/, ''))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  const write = (path) => (repository) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true })
    writeFileSync(join(repository, path), 'changed\n')
  }
  assert.deepEqual(selected(write('apps/desktop/src-tauri/src/main.rs')), all)
  assert.deepEqual(selected(write('apps/desktop/src-tauri/native/windows/downloads.json')), all)
  assert.deepEqual(selected(write('.github/workflows/desktop-build.yml')), all)
  assert.deepEqual(selected(write('.github/actions/desktop-nsis-tools/action.yml')), all)
  assert.deepEqual(selected(write('package-lock.json')), native)
  assert.deepEqual(selected((repository) => {
    mkdirSync(join(repository, 'docs'))
    git(repository, 'mv', 'apps/desktop/src-tauri/src/main.rs', 'docs/main.rs')
  }), all, 'a file that leaves the shell still compiles every target')
})
