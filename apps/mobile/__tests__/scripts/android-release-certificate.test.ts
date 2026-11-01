import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const workflowPath = fileURLToPath(new URL('../../../../.github/workflows/android-release.yml', import.meta.url))
const workflow = require('js-yaml').load(readFileSync(workflowPath, 'utf8')) as {
  jobs: { 'release-android': { steps: { name?: string; run?: string }[] } }
}
const steps = workflow.jobs['release-android'].steps
const guardName = 'Verify AAB signing certificate matches the upload keystore'
const directory = mkdtempSync(join(tmpdir(), 'orbit-signing-certificate-'))
const fixturePassword = randomBytes(16).toString('hex')
const fixtureEnv = { ...process.env, ANDROID_KEYSTORE_PASSWORD: fixturePassword, ANDROID_KEY_ALIAS: 'upload' }

function runJavaTool(command: string, args: string[]) {
  return execFileSync(command, args, { cwd: directory, env: fixtureEnv, stdio: 'pipe' })
}

beforeAll(() => {
  for (const alias of ['upload', 'other']) {
    runJavaTool('keytool', ['-genkeypair', '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048',
      '-dname', 'CN=Signing Fixture', '-validity', '1', '-keystore', 'upload-keystore.jks', '-storetype', 'JKS',
      '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-keypass:env', 'ANDROID_KEYSTORE_PASSWORD'])
  }
  writeFileSync(join(directory, 'payload.txt'), 'signed fixture')
  runJavaTool('jar', ['--create', '--file', 'unsigned.aab', 'payload.txt'])
  const signingArgs = ['-keystore', 'upload-keystore.jks', '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD',
    '-keypass:env', 'ANDROID_KEYSTORE_PASSWORD']
  runJavaTool('jarsigner', [...signingArgs, '-signedjar', 'matching.aab', 'unsigned.aab', 'upload'])
  runJavaTool('jarsigner', [...signingArgs, '-signedjar', 'mismatched.aab', 'unsigned.aab', 'other'])
  runJavaTool('jarsigner', [...signingArgs, '-signedjar', 'multiple-signers.aab', 'matching.aab', 'other'])
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('Android release certificate guard', () => {
  it('runs after the bundle build and before artifact upload, Play submission and secret cleanup', () => {
    const index = steps.findIndex((step) => step.name === guardName)
    const buildIndex = steps.findIndex((step) => step.name === 'Build signed AAB with Gradle')
    expect(buildIndex).toBeGreaterThanOrEqual(0)
    expect(index).toBeGreaterThan(buildIndex)
    for (const name of ['Upload AAB artifact', 'Submit build to Google Play', 'Remove the release secrets from the checkout']) {
      expect(index).toBeLessThan(steps.findIndex((step) => step.name === name))
    }
  })

  it.each([
    ['matching.aab', 'upload', true],
    ['mismatched.aab', 'upload', false],
    ['unsigned.aab', 'upload', false],
    ['multiple-signers.aab', 'upload', false],
    ['missing.aab', 'upload', false],
    ['matching.aab', 'missing-alias', false],
  ])('checks the real signed archive %s against alias %s', (archive, alias, succeeds) => {
    const guard = steps.find((step) => step.name === guardName)?.run
    expect(guard, 'the release workflow must check its signing certificate').toBeTypeOf('string')
    if (!guard) throw new Error('Missing release certificate guard')
    const project = mkdtempSync(join(directory, 'project-'))
    const app = join(project, 'app')
    const bundle = join(app, 'build/outputs/bundle/release')
    mkdirSync(bundle, { recursive: true })
    copyFileSync(join(directory, 'upload-keystore.jks'), join(app, 'upload-keystore.jks'))
    if (archive !== 'missing.aab') copyFileSync(join(directory, archive), join(bundle, 'app-release.aab'))
    const result = spawnSync('/bin/bash', ['-c', guard], {
      cwd: project, env: { ...fixtureEnv, ANDROID_KEY_ALIAS: alias }, encoding: 'utf8',
    })
    expect(result.status === 0, result.stderr).toBe(succeeds)
    expect(result.stdout + result.stderr).not.toContain(fixturePassword)
    if (succeeds) {
      expect(result.stdout.trim().split('\n')).toHaveLength(2)
      expect(result.stdout).toMatch(/AAB SHA-256: (?:[A-F0-9]{2}:){31}[A-F0-9]{2}/)
      expect(result.stdout).toMatch(/Upload keystore SHA-256: (?:[A-F0-9]{2}:){31}[A-F0-9]{2}/)
    }
  })
})
