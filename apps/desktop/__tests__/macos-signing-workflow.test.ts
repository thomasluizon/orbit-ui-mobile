import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
interface Step { name?: string; run?: string; if?: string; env?: Record<string, string>; 'working-directory'?: string }
interface Workflow {
  on: { workflow_call: { secrets: Record<string, { required: boolean }> } }
  jobs: Record<string, { steps: Step[]; secrets?: Record<string, string> }>
}
const read = (name: string) => readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), 'utf8')
const source = read('desktop-release')
const workflow = load(source)
const steps = workflow.jobs.build!.steps
const step = (name: string) => steps.find(entry => entry.name === name)!
const macSecrets = [
  'MACOS_DEVELOPER_ID_CERTIFICATE_BASE64', 'MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD', 'MACOS_PROVISIONING_PROFILE_BASE64',
  'APP_STORE_CONNECT_API_KEY_ID', 'APP_STORE_CONNECT_API_ISSUER_ID', 'APP_STORE_CONNECT_API_PRIVATE_KEY',
]
const team = 'BD7JH468F7'
const identifier = 'org.useorbit.desktop.staging'
const target = 'aarch64-apple-darwin'
const directories: string[] = []
// WHY: The macOS build steps run in Bash with POSIX tar; Windows hosts only run the Windows packaging step.
const shellTest = it.skipIf(process.platform === 'win32')
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

const tools: Record<string, string> = {
  codesign: `if (args.includes('-d')) process.stdout.write(process.env.FAKE_ENTITLEMENTS)`,
  spctl: '',
  security: `process.stdout.write(fs.readFileSync(args[args.indexOf('-i') + 1]))`,
  PlistBuddy: `let value = JSON.parse(fs.readFileSync(args[2], 'utf8'))
for (const key of args[1].replace(/^Print :/, '').split(':')) value = value?.[key]
if (typeof value !== 'string') process.exit(1)
process.stdout.write(value + '\\n')`,
  xcrun: `if (args[0] === 'notarytool' && args[1] === 'submit') process.stdout.write(process.env.FAKE_SUBMISSION)`,
  npm: '',
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-macos-'))
  directories.push(directory)
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  mkdirSync(join(directory, 'tmp'))
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(bin, name), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const line = ${JSON.stringify(name)} + ' ' + args.join(' ')
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify([${JSON.stringify(name)}, ...args]) + '\\n')
if (${JSON.stringify(name)} === 'npm') fs.writeFileSync(process.env.COMMAND_LOG + '.env', JSON.stringify({ APPLE_API_KEY_PATH: process.env.APPLE_API_KEY_PATH }))
if (process.env.FAKE_FAIL && new RegExp(process.env.FAKE_FAIL).test(line)) process.exit(1)
${body}
`)
    chmodSync(join(bin, name), 0o755)
  }
  return { directory, bin, log: join(directory, 'commands.jsonl') }
}

function bundleFixture(directory: string, profileApplication = `${team}.${identifier}`, dmgCount = 1) {
  const bundle = join(directory, `apps/desktop/src-tauri/target/${target}/release/bundle`)
  const contents = join(bundle, 'macos/Orbit Staging.app/Contents')
  mkdirSync(contents, { recursive: true })
  writeFileSync(join(contents, 'embedded.provisionprofile'), JSON.stringify({ Entitlements: { 'com.apple.application-identifier': profileApplication } }))
  execFileSync('tar', ['-czf', 'Orbit Staging.app.tar.gz', 'Orbit Staging.app'], { cwd: join(bundle, 'macos') })
  mkdirSync(join(bundle, 'dmg'))
  for (let index = 0; index < dmgCount; index++) writeFileSync(join(bundle, 'dmg', `Orbit Staging_${index}.dmg`), 'dmg')
  return bundle
}

function run(name: string, directory: string, bin: string, log: string, env: Record<string, string> = {}) {
  writeFileSync(log, '')
  const script = step(name).run!.replaceAll('/usr/libexec/PlistBuddy', join(bin, 'PlistBuddy'))
  const result = spawnSync('bash', ['-c', script], { cwd: directory, encoding: 'utf8', env: {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: log, RUNNER_TEMP: join(directory, 'tmp'),
    DESKTOP_TARGET: target, DESKTOP_VARIANT: 'staging', ORBIT_APPLE_TEAM_ID: team, ORBIT_MACOS_IDENTIFIER: identifier,
    ORBIT_MACOS_SIGNING: join(directory, 'tmp/macos-signing'), ...env,
  } })
  const commands = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as string[])
  return { result, commands }
}

const entitlements = (overrides: Record<string, string> = {}) => JSON.stringify({
  'com.apple.developer.aps-environment': 'production',
  'com.apple.application-identifier': `${team}.${identifier}`,
  'com.apple.developer.team-identifier': team,
  ...overrides,
})

it('passes every macOS signing secret from the web release into the reusable desktop release', () => {
  const declared = workflow.on.workflow_call.secrets
  const caller = load(read('release')).jobs['desktop-release']!.secrets!
  for (const secret of macSecrets) {
    expect(declared[secret]).toEqual({ required: true })
    expect(caller[secret]).toBe(`\${{ secrets.${secret} }}`)
  }
  expect(source).not.toContain('Production DMGs stay unsigned')
})

it('maps the environment credentials to the Tauri signing and notarization inputs only after compilation', () => {
  const compile = step('Compile the macOS shell without signing credentials')
  const sign = step('Sign, notarize and staple the macOS app, then sign the DMG')
  expect(compile.if).toBe("runner.os == 'macOS'")
  expect(compile.env).toBeUndefined()
  expect(steps.indexOf(compile)).toBeLessThan(steps.indexOf(sign))
  expect(sign.env).toEqual({
    APPLE_CERTIFICATE: '${{ secrets.MACOS_DEVELOPER_ID_CERTIFICATE_BASE64 }}',
    APPLE_CERTIFICATE_PASSWORD: '${{ secrets.MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD }}',
    APPLE_SIGNING_IDENTITY: '${{ vars.MACOS_SIGNING_IDENTITY }}',
    APPLE_API_KEY: '${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}',
    APPLE_API_ISSUER: '${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}',
    TAURI_SIGNING_PRIVATE_KEY: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}',
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}',
  })
  const order = ['Sign, notarize and staple the macOS app, then sign the DMG', 'Notarize and staple the DMG',
    'Verify macOS signatures, notarization and the push entitlement', 'Collect the updater package',
    'Collect the production DMG', 'Sign and verify the updater package'].map(name => steps.indexOf(step(name)))
  expect(order).toEqual([...order].sort((left, right) => left - right))
  expect(step('Collect the production DMG').if).toBe("inputs.variant == 'production' && runner.os == 'macOS'")
})

shellTest.each(['staging', 'production'])('packages Windows %s unsigned and compiles macOS without bundling', (variant) => {
  const { directory, bin, log } = fixture()
  const windows = run('Package without operating system or updater signing', directory, bin, log, { DESKTOP_VARIANT: variant })
  expect(step('Package without operating system or updater signing').if).toBe("runner.os == 'Windows'")
  expect(windows.result.status, windows.result.stderr).toBe(0)
  expect(windows.commands[0]).toEqual(['npm', 'run', `build:${variant}`, '-w', '@orbit/desktop', '--', '--config', 'release-config.json',
    '--target', target, '--no-sign', '--ci', '--', '--locked'])
  const compile = run('Compile the macOS shell without signing credentials', directory, bin, log, { DESKTOP_VARIANT: variant })
  expect(compile.result.status, compile.result.stderr).toBe(0)
  expect(compile.commands[0]).toEqual(['npm', 'run', `build:${variant}`, '-w', '@orbit/desktop', '--', '--config', 'release-config.json',
    '--target', target, '--no-bundle', '--ci', '--', '--locked'])
})

shellTest.each(['staging', 'production'])('bundles the %s app and DMG with operating system signing and the provisioning profile overlay', (variant) => {
  const { directory, bin, log } = fixture()
  const credentials = { APPLE_CERTIFICATE: 'certificate', APPLE_CERTIFICATE_PASSWORD: 'password', APPLE_SIGNING_IDENTITY: 'identity',
    APPLE_API_KEY: 'key', APPLE_API_ISSUER: 'issuer', TAURI_SIGNING_PRIVATE_KEY: 'updater' }
  const signed = run('Sign, notarize and staple the macOS app, then sign the DMG', directory, bin, log, { ...credentials, DESKTOP_VARIANT: variant })
  expect(signed.result.status, signed.result.stderr).toBe(0)
  const signing = join(directory, 'tmp/macos-signing')
  expect(signed.commands).toEqual([['npm', 'run', `bundle:${variant}`, '--', '--config', 'release-config.json',
    '--config', join(signing, 'signing-config.json'), '--target', target, '--bundles', 'app,dmg', '--ci']])
  expect(JSON.parse(readFileSync(`${log}.env`, 'utf8'))).toEqual({ APPLE_API_KEY_PATH: join(signing, 'AuthKey.p8') })
  for (const missing of Object.keys(credentials)) {
    const failed = run('Sign, notarize and staple the macOS app, then sign the DMG', directory, bin, log, { ...credentials, [missing]: '', DESKTOP_VARIANT: variant })
    expect(failed.result.status).not.toBe(0)
    expect(failed.result.stdout).toContain(`Missing ${missing}`)
    expect(failed.commands).toEqual([])
  }
})

shellTest.each([
  { variant: 'staging', config: 'tauri.conf.json', expected: 'org.useorbit.desktop.staging' },
  { variant: 'production', config: 'tauri.production.conf.json', expected: 'org.useorbit.desktop' },
])('writes the $variant provisioning profile overlay only for its own App ID', ({ variant, config, expected }) => {
  const { directory, bin, log } = fixture()
  mkdirSync(join(directory, 'apps/desktop/src-tauri'), { recursive: true })
  writeFileSync(join(directory, 'apps/desktop/src-tauri', config), readFileSync(new URL(`../src-tauri/${config}`, import.meta.url)))
  const githubEnv = join(directory, 'github-env')
  const profile = (application: string) => Buffer.from(JSON.stringify({ Entitlements: { 'com.apple.application-identifier': application } })).toString('base64')
  const base = { DESKTOP_VARIANT: variant, GITHUB_ENV: githubEnv, APP_STORE_CONNECT_API_PRIVATE_KEY: 'private key' }
  const accepted = run('Write the macOS provisioning profile and notarization key', directory, bin, log, { ...base, MACOS_PROVISIONING_PROFILE_BASE64: profile(`${team}.${expected}`) })
  expect(accepted.result.status, accepted.result.stderr).toBe(0)
  const signing = join(directory, 'tmp/macos-signing')
  expect(JSON.parse(readFileSync(join(signing, 'signing-config.json'), 'utf8'))).toEqual({
    bundle: { macOS: { files: { 'embedded.provisionprofile': join(signing, 'embedded.provisionprofile') } } },
  })
  expect(readFileSync(join(signing, 'AuthKey.p8'), 'utf8')).toBe('private key\n')
  expect(readFileSync(githubEnv, 'utf8')).toBe(`ORBIT_MACOS_SIGNING=${signing}\nORBIT_MACOS_IDENTIFIER=${expected}\n`)
  const other = expected.endsWith('.staging') ? 'org.useorbit.desktop' : 'org.useorbit.desktop.staging'
  rmSync(signing, { recursive: true })
  const rejected = run('Write the macOS provisioning profile and notarization key', directory, bin, log, { ...base, MACOS_PROVISIONING_PROFILE_BASE64: profile(`${team}.${other}`) })
  expect(rejected.result.status).not.toBe(0)
  expect(rejected.result.stdout).toContain(`not ${team}.${expected}`)
  expect(existsSync(join(signing, 'signing-config.json'))).toBe(false)
})

shellTest.each([
  { status: 'Accepted', accepted: true },
  { status: 'Invalid', accepted: false },
])('staples the DMG only after notarization is $status', ({ status, accepted }) => {
  const { directory, bin, log } = fixture()
  const bundle = bundleFixture(directory)
  const notarized = run('Notarize and staple the DMG', directory, bin, log, {
    APP_STORE_CONNECT_API_KEY_ID: 'key', APP_STORE_CONNECT_API_ISSUER_ID: 'issuer',
    FAKE_SUBMISSION: JSON.stringify({ id: 'submission', status, message: 'done' }),
  })
  expect(notarized.result.status === 0, notarized.result.stderr).toBe(accepted)
  const dmg = join(bundle, 'dmg/Orbit Staging_0.dmg').slice(directory.length + 1)
  const credentials = ['--key', join(directory, 'tmp/macos-signing/AuthKey.p8'), '--key-id', 'key', '--issuer', 'issuer']
  expect(notarized.commands[0]).toEqual(['xcrun', 'notarytool', 'submit', dmg, ...credentials, '--wait', '--output-format', 'json'])
  expect(notarized.commands[1]).toEqual(accepted ? ['xcrun', 'stapler', 'staple', dmg] : ['xcrun', 'notarytool', 'log', 'submission', ...credentials])
  expect(notarized.commands).toHaveLength(2)
})

shellTest('refuses to notarize an ambiguous DMG output', () => {
  const { directory, bin, log } = fixture()
  bundleFixture(directory, undefined, 2)
  const notarized = run('Notarize and staple the DMG', directory, bin, log, { FAKE_SUBMISSION: '{}' })
  expect(notarized.result.status).not.toBe(0)
  expect(notarized.commands).toEqual([])
})

shellTest('verifies the signed app, the updater archive app and the DMG', () => {
  const { directory, bin, log } = fixture()
  const bundle = bundleFixture(directory)
  const verified = run('Verify macOS signatures, notarization and the push entitlement', directory, bin, log, { FAKE_ENTITLEMENTS: entitlements() })
  expect(verified.result.status, verified.result.stderr).toBe(0)
  const app = join(bundle, 'macos/Orbit Staging.app').slice(directory.length + 1)
  const updaterApp = join(directory, 'tmp/macos-updater-app/Orbit Staging.app')
  const dmg = join(bundle, 'dmg/Orbit Staging_0.dmg').slice(directory.length + 1)
  const checks = verified.commands.filter(command => command[0] !== 'PlistBuddy')
  expect(checks).toEqual([app, updaterApp].flatMap(path => [
    ['codesign', '--verify', '--deep', '--strict', '--verbose=2', path],
    ['codesign', '-d', '--entitlements', ':-', path],
    ['security', 'cms', '-D', '-i', `${path}/Contents/embedded.provisionprofile`],
    ['spctl', '--assess', '--type', 'execute', '--verbose=2', path],
    ['xcrun', 'stapler', 'validate', path],
  ]).concat([
    ['spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg],
    ['xcrun', 'stapler', 'validate', dmg],
  ]))
  expect(verified.commands.filter(command => command[0] === 'PlistBuddy').map(command => command[2])).toEqual([app, updaterApp].flatMap(() => [
    'Print :com.apple.developer.aps-environment', 'Print :com.apple.application-identifier',
    'Print :com.apple.developer.team-identifier', 'Print :Entitlements:com.apple.application-identifier',
  ]))
})

shellTest.each<{ case: string; fail?: string; entitlements?: Record<string, string>; profile?: string }>([
  { case: 'an unsigned app', fail: '^codesign --verify .*Orbit Staging\\.app$' },
  { case: 'a Gatekeeper rejection', fail: '^spctl --assess --type execute' },
  { case: 'an unstapled app', fail: '^xcrun stapler validate .*\\.app$' },
  { case: 'an unstapled DMG', fail: '^xcrun stapler validate .*\\.dmg$' },
  { case: 'a rejected DMG signature', fail: '^spctl --assess --type open' },
  { case: 'a development push entitlement', entitlements: { 'com.apple.developer.aps-environment': 'development' } },
  { case: 'a foreign App ID entitlement', entitlements: { 'com.apple.application-identifier': `${team}.org.useorbit.desktop` } },
  { case: 'a foreign team entitlement', entitlements: { 'com.apple.developer.team-identifier': 'AAAAAAAAAA' } },
  { case: 'a foreign provisioning profile', profile: `${team}.org.useorbit.desktop` },
])('fails the release on $case', ({ fail, entitlements: overrides, profile }) => {
  const { directory, bin, log } = fixture()
  bundleFixture(directory, profile)
  const verified = run('Verify macOS signatures, notarization and the push entitlement', directory, bin, log, {
    FAKE_ENTITLEMENTS: entitlements(overrides), FAKE_FAIL: fail ?? '',
  })
  expect(verified.result.status).not.toBe(0)
})
