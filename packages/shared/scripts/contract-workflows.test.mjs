import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { contractFiles, generatedDirectory } from './contract-source.mjs'

const repository = new URL('../../../', import.meta.url).pathname
const directory = `packages/shared/${generatedDirectory}`
const roots = []
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const workflow = (name) => yaml.load(readFileSync(resolve(repository, '.github/workflows', name), 'utf8'))

function prepare(base, branch, handwritten = false) {
  const root = mkdtempSync(resolve(tmpdir(), 'orbit-publication-'))
  roots.push(root)
  const remote = resolve(root, 'remote')
  const seed = resolve(root, 'seed')
  const publish = resolve(root, 'publish')
  git(root, 'init', '--bare', remote)
  git(root, 'clone', remote, seed)
  git(seed, 'config', 'user.name', 'Contract tests')
  git(seed, 'config', 'user.email', 'contract@example.invalid')
  git(seed, 'switch', '--create', base)
  mkdirSync(resolve(seed, directory), { recursive: true })
  writeFileSync(resolve(seed, directory, 'api.spec.commit'), `${'a'.repeat(40)}\n`)
  writeFileSync(resolve(seed, directory, 'api.generated.ts'), 'legacy snapshot\n')
  git(seed, 'add', directory)
  git(seed, 'commit', '-m', 'Initial contract')
  git(seed, 'push', 'origin', base)
  git(seed, 'switch', '--create', branch)
  writeFileSync(resolve(seed, directory, 'api.spec.commit'), `${'b'.repeat(40)}\n`)
  if (handwritten) writeFileSync(resolve(seed, 'handwritten.ts'), 'export const unexpected = true\n')
  git(seed, 'add', directory, ...(handwritten ? ['handwritten.ts'] : []))
  git(seed, 'commit', '-m', 'Routine legacy pair')
  git(seed, 'push', 'origin', branch)
  git(seed, 'switch', base)
  writeFileSync(resolve(seed, directory, 'api.spec.commit'), `${'c'.repeat(40)}\n`)
  writeFileSync(resolve(seed, directory, 'api.spec.selection.json'), '{"id":"orbit-http-v1-r2","httpVersion":"1.0"}\n')
  writeFileSync(resolve(seed, directory, 'api.generated.ts'), 'corrected snapshot\n')
  git(seed, 'add', directory)
  git(seed, 'commit', '-m', 'Adopt explicit revision')
  git(seed, 'push', 'origin', base)
  git(root, 'clone', '--branch', base, remote, publish)
  return { root, publish, baseCommit: git(publish, 'rev-parse', 'HEAD') }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe.each([
  ['contract-rebaseline.yml', 'main', 'chore/contract-snapshot'],
  ['contract-rebaseline-redesign.yml', 'redesign/main', 'chore/contract-snapshot-redesign'],
])('%s publication', (filename, base, branch) => {
  const definition = workflow(filename)
  const carry = definition.jobs.publish.steps.find((step) => step.name?.startsWith('Carry the target branch'))
  const publish = definition.jobs.publish.steps.find((step) => step.name === 'Commit and open or update one pull request')

  it('carries target selection into an old routine branch and publishes all three files', () => {
    const staged = prepare(base, branch)
    const environment = { ...process.env, GENERATED_BASE: staged.baseCommit, RUNNER_TEMP: staged.root }
    const carried = spawnSync('bash', ['-c', carry.run], { cwd: staged.publish, env: environment, encoding: 'utf8' })
    expect(carried.status, carried.stderr).toBe(0)
    expect(readFileSync(resolve(staged.publish, directory, 'api.spec.commit'), 'utf8')).toBe(`${'c'.repeat(40)}\n`)
    expect(() => readFileSync(resolve(staged.publish, directory, 'api.spec.selection.json'))).toThrow()
    writeFileSync(resolve(staged.publish, directory, 'api.spec.selection.json'), '{"id":"orbit-http-v1-r2","httpVersion":"1.0"}\n')
    writeFileSync(resolve(staged.publish, directory, 'api.spec.commit'), `${'d'.repeat(40)}\n`)
    writeFileSync(resolve(staged.publish, directory, 'api.generated.ts'), 'new snapshot\n')
    const script = publish.run.slice(publish.run.indexOf('snapshot='), publish.run.indexOf('cat >'))
    const result = spawnSync('bash', ['-c', `set -euo pipefail\n${script}`], { cwd: staged.publish, env: environment, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(git(staged.publish, 'diff', '--name-only', `origin/${base}`, 'HEAD').split('\n').sort())
      .toEqual([`${directory}/api.generated.ts`, `${directory}/api.spec.commit`])
    expect(git(staged.publish, 'show', `HEAD:${directory}/api.spec.selection.json`)).toContain('orbit-http-v1-r2')
    expect(git(staged.publish, 'rev-parse', 'HEAD')).toBe(git(staged.publish, 'rev-parse', `origin/${branch}`))
  })

  it.each(['api.spec.commit', 'api.spec.selection.json'])('detects a %s-only move with identical output', (changed) => {
    const staged = prepare(base, branch)
    for (const file of contractFiles) {
      if (file === 'api.spec.selection.json') continue
      writeFileSync(resolve(staged.publish, directory, file), git(staged.publish, 'show', `origin/${branch}:${directory}/${file}`) + '\n')
    }
    if (changed === 'api.spec.commit') {
      rmSync(resolve(staged.publish, directory, 'api.spec.selection.json'))
      writeFileSync(resolve(staged.publish, directory, changed), `${'d'.repeat(40)}\n`)
    }
    const step = definition.jobs.generate.steps.find((entry) => entry.id === 'regenerate')
    const script = step.run.slice(step.run.indexOf('branch='))
    const output = resolve(staged.root, 'output')
    const result = spawnSync('bash', ['-c', `set -euo pipefail\n${script}`], { cwd: staged.publish,
      env: { ...process.env, GITHUB_OUTPUT: output }, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe('moved=true\n')
  })

  it('rejects a target race before touching the routine branch', () => {
    const staged = prepare(base, branch)
    const result = spawnSync('bash', ['-c', carry.run], { cwd: staged.publish,
      env: { ...process.env, GENERATED_BASE: 'a'.repeat(40), RUNNER_TEMP: staged.root }, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('target branch moved')
    expect(git(staged.publish, 'branch', '--show-current')).toBe(base)
  })

  it('refuses to broaden a routine branch containing handwritten changes', () => {
    const staged = prepare(base, branch, true)
    const result = spawnSync('bash', ['-c', carry.run], { cwd: staged.publish,
      env: { ...process.env, GENERATED_BASE: staged.baseCommit, RUNNER_TEMP: staged.root }, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('handwritten changes')
    expect(git(staged.publish, 'branch', '--show-current')).toBe(base)
  })

  it('keeps source metadata in artifact transfer, every comparison and every publication', () => {
    const generate = definition.jobs.generate
    const upload = generate.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    const regenerate = generate.steps.find((step) => step.id === 'regenerate')
    for (const file of contractFiles) {
      expect(upload.with.path).toContain(`${directory}/${file}`)
      expect(regenerate.run).toContain(`${directory}/${file}`)
    }
    expect(regenerate.run).not.toContain('git checkout')
    expect(regenerate.run).toContain('scripts/generate-contract.mjs --candidate "$api_commit"')
    expect(generate.permissions).toEqual({ contents: 'read' })
    expect(generate.steps.some((step) => step.uses?.startsWith('actions/create-github-app-token@'))).toBe(false)
    expect(JSON.stringify(definition.jobs.publish.steps)).not.toMatch(/npm ci|generate-contract|npx|orval/)
    expect(publish.run).toContain('git add -- "$selection"')
    expect(publish.run).toContain('"$snapshot" "$pin" "$selection"')
    expect(definition.concurrency['cancel-in-progress']).toBe(false)
  })
})
