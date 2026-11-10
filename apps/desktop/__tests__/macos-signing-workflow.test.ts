import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { readSubmissionId, submissionFile } from '../scripts/notary.ts'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
interface Step { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, string | boolean | number>; 'working-directory'?: string }
interface Job {
  steps?: Step[]; secrets?: Record<string, string>; needs?: string | string[]; 'runs-on'?: string; 'timeout-minutes'?: number | string
  environment?: string; strategy?: { matrix: { target?: string[]; include?: { runner: string; target: string }[] } }
}
const stepsOf = (job: Job) => job.steps ?? []
interface Workflow {
  on: { workflow_call: { secrets: Record<string, { required: boolean }> } }
  jobs: Record<string, Job>
}
const read = (name: string) => readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), 'utf8')
const source = read('desktop-release')
const workflow = load(source)
const jobs = workflow.jobs
const steps = stepsOf(jobs.build!)
const stapleSteps = stepsOf(jobs.staple!)
const allSteps = Object.values(jobs).flatMap(stepsOf)
const step = (name: string) => allSteps.find(entry => entry.name === name)!
const submissionId = '2efe2717-52ef-43a5-96dc-0797e4ca1041'
const macSecrets = [
  'MACOS_DEVELOPER_ID_CERTIFICATE_BASE64', 'MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD', 'MACOS_PROVISIONING_PROFILE_BASE64',
  'APP_STORE_CONNECT_API_KEY_ID', 'APP_STORE_CONNECT_API_ISSUER_ID', 'APP_STORE_CONNECT_API_PRIVATE_KEY',
]
const team = 'BD7JH468F7'
const identifier = 'org.useorbit.desktop.staging'
const target = 'aarch64-apple-darwin'
const directories: string[] = []
/** WHY: The macOS build steps run in Bash with POSIX tar; Windows hosts only run the Windows packaging step. */
const shellTest = it.skipIf(process.platform === 'win32')
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

/** WHY: macOS hosts read the fixtures with the real PlistBuddy; other hosts use a reader for the same XML plist shape. */
const plistBuddy = `if (fs.existsSync('/usr/libexec/PlistBuddy')) {
  process.exit(require('node:child_process').spawnSync('/usr/libexec/PlistBuddy', args, { stdio: 'inherit' }).status ?? 1)
}
const tokens = [...fs.readFileSync(args[2], 'utf8').matchAll(/<(\\/?)(dict|array|key|string|date|data|integer|true|false)(\\/?)>([^<]*)/g)]
let position = 0
const closes = (tag) => tokens[position][1] === '/' && tokens[position][2] === tag
function parse() {
  const [, , tag, empty, text] = tokens[position++]
  if (empty) return tag === 'dict' ? {} : tag === 'array' ? [] : tag === 'true' ? true : tag === 'false' ? false : ''
  if (tag === 'dict') {
    const value = {}
    while (!closes('dict')) { const key = tokens[position][4]; position += 2; value[key] = parse() }
    position++
    return value
  }
  if (tag === 'array') {
    const value = []
    while (!closes('array')) value.push(parse())
    position++
    return value
  }
  position++
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}
let value = parse()
for (const key of args[1].replace(/^Print :/, '').split(':')) value = value?.[key]
if (typeof value !== 'string') { process.stderr.write('Print: Entry, "' + args[1] + '", Does Not Exist\\n'); process.exit(1) }
process.stdout.write(value + '\\n')`

const tools: Record<string, string> = {
  codesign: `if (args.includes('-d')) {
  process.stderr.write('Executable=' + args.at(-1) + '/Contents/MacOS/orbit\\n')
  process.stdout.write(process.env.FAKE_ENTITLEMENTS)
}`,
  spctl: '',
  security: `process.stdout.write(fs.readFileSync(args[args.indexOf('-i') + 1]))`,
  PlistBuddy: plistBuddy,
  xcrun: `if (args[0] === 'notarytool' && args[1] === 'submit') process.stdout.write(process.env.FAKE_SUBMISSION)
if (args[0] === 'stapler' && args[1] === 'staple') {
  const target = args[2].endsWith('.app') ? args[2] + '/Contents/CodeResources' : args[2]
  fs.appendFileSync(target, 'ticket')
}`,
  npm: '',
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-macos-'))
  directories.push(directory)
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  mkdirSync(join(directory, 'tmp'))
  mkdirSync(join(directory, 'apps/desktop'), { recursive: true })
  cpSync(fileURLToPath(new URL('../scripts', import.meta.url)), join(directory, 'apps/desktop/scripts'), { recursive: true })
  writeFileSync(join(directory, 'apps/desktop/package.json'), '{ "type": "module" }\n')
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

const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const xmlStrings = (values: Record<string, string>, indent: string, separator: string) => Object.entries(values)
  .map(([key, value]) => `${indent}<key>${escapeXml(key)}</key>${separator}${indent}<string>${escapeXml(value)}</string>`).join(separator)

/** WHY: The shape of security cms -D output for the Orbit Developer ID profiles: tab-indented XML with dates, data and arrays. */
const decodedProfile = (application: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>AppIDName</key>
\t<string>Orbit &amp; Desktop</string>
\t<key>CreationDate</key>
\t<date>2026-11-07T16:49:04Z</date>
\t<key>Platform</key>
\t<array>
\t\t<string>OSX</string>
\t</array>
\t<key>IsXcodeManaged</key>
\t<false/>
\t<key>DeveloperCertificates</key>
\t<array>
\t\t<data>AAAA</data>
\t</array>
\t<key>Entitlements</key>
\t<dict>
${xmlStrings({ 'com.apple.developer.aps-environment': 'production', 'com.apple.application-identifier': application }, '\t\t', '\n')}
\t\t<key>keychain-access-groups</key>
\t\t<array>
\t\t\t<string>${team}.*</string>
\t\t</array>
${xmlStrings({ 'com.apple.developer.team-identifier': team }, '\t\t', '\n')}
\t</dict>
</dict>
</plist>
`

function bundleFixture(directory: string, profileApplication = `${team}.${identifier}`, dmgCount = 1) {
  const bundle = join(directory, `apps/desktop/src-tauri/target/${target}/release/bundle`)
  const contents = join(bundle, 'macos/Orbit Staging.app/Contents')
  mkdirSync(contents, { recursive: true })
  writeFileSync(join(contents, 'embedded.provisionprofile'), decodedProfile(profileApplication))
  mkdirSync(join(contents, 'MacOS'))
  writeFileSync(join(contents, 'MacOS/orbit'), 'binary')
  chmodSync(join(contents, 'MacOS/orbit'), 0o755)
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

/** WHY: The shape of codesign -d --entitlements - --xml output: one line of XML on stdout. */
const entitlements = (overrides: Record<string, string> = {}) => '<?xml version="1.0" encoding="UTF-8"?>'
  + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  + `<plist version="1.0"><dict>${xmlStrings({
    'com.apple.application-identifier': `${team}.${identifier}`,
    'com.apple.developer.aps-environment': 'production',
    'com.apple.developer.team-identifier': team,
    ...overrides,
  }, '', '')}</dict></plist>`

it('passes every macOS signing secret from the web release into the reusable desktop release', () => {
  const declared = workflow.on.workflow_call.secrets
  const caller = load(read('release')).jobs['desktop-release']!.secrets!
  for (const secret of macSecrets) {
    expect(declared[secret]).toEqual({ required: true })
    expect(caller[secret]).toBe(`\${{ secrets.${secret} }}`)
  }
  expect(source).not.toContain('Production DMGs stay unsigned')
})

const notaryInputs = ['APPLE_API_KEY', 'APPLE_API_ISSUER', 'APPLE_API_KEY_PATH', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']
const stapleStep = (name: string) => stapleSteps.find(entry => entry.name === name)!
const download = (job: Job) => stepsOf(job).find(entry => entry.uses?.startsWith('actions/download-artifact@'))!

it('keeps every Apple notarization wait off the macOS runners', () => {
  for (const job of [jobs.build!, jobs.staple!]) {
    for (const entry of stepsOf(job)) {
      expect(entry.run ?? '', entry.name).not.toMatch(/(^|\s)--wait(\s|$)/)
      expect(entry.run ?? '', entry.name).not.toMatch(/notarytool (wait|info|log)\b/)
      expect(entry.run ?? '', entry.name).not.toContain('APPLE_API_KEY_PATH')
      for (const input of notaryInputs) expect(Object.keys(entry.env ?? {}), entry.name).not.toContain(input)
    }
  }
  expect(jobs.build!['timeout-minutes']).toBe(35)
  expect(jobs.staple!['timeout-minutes']).toBe(20)
  expect(source).not.toContain('timeout: 120')
})

it('signs after compilation, then submits the DMG once and hands off the signed bundle and its submission id', () => {
  const compile = step('Compile the macOS shell without signing credentials')
  const sign = step('Sign the macOS app and DMG')
  expect(compile.if).toBe("runner.os == 'macOS'")
  expect(compile.env).toBeUndefined()
  expect(sign.env).toEqual({
    APPLE_CERTIFICATE: '${{ secrets.MACOS_DEVELOPER_ID_CERTIFICATE_BASE64 }}',
    APPLE_CERTIFICATE_PASSWORD: '${{ secrets.MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD }}',
    APPLE_SIGNING_IDENTITY: '${{ vars.MACOS_SIGNING_IDENTITY }}',
    TAURI_SIGNING_PRIVATE_KEY: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}',
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}',
  })
  const order = [compile, step('Write the macOS provisioning profile and notarization key'), sign,
    step('Submit the DMG for notarization without waiting'), step('Archive the signed macOS bundle')].map(entry => steps.indexOf(entry))
  expect(order).toEqual([...order].sort((left, right) => left - right))
  const submitters = Object.entries(jobs).filter(([, job]) => stepsOf(job).some(entry => entry.run?.includes('notarytool submit'))).map(([name]) => name)
  expect(submitters).toEqual(['build'])
  const uploads = steps.filter(entry => entry.uses?.startsWith('actions/upload-artifact@'))
  expect(uploads.map(entry => [entry.if, entry.with!.name, entry.with!.path])).toEqual([
    ["runner.os == 'macOS'", 'desktop-macos-signed-${{ matrix.target }}', '${{ runner.temp }}/macos-signed/bundle.tar'],
    ["runner.os == 'macOS'", 'desktop-macos-notary-${{ matrix.target }}', '${{ runner.temp }}/macos-notary/notary-${{ matrix.target }}.json'],
    ["runner.os == 'Windows'", 'desktop-release-${{ matrix.target }}', '${{ runner.temp }}/desktop-assets/*'],
  ])
  expect(uploads.every(entry => steps.indexOf(entry) > order.at(-1)!)).toBe(true)
  for (const name of ['Collect the updater package', 'Sign and verify the updater package']) expect(step(name).if).toBe("runner.os == 'Windows'")
})

it('waits for Apple only in a Linux job that a failed-job rerun repeats from the recorded submission ids', () => {
  const notarize = jobs.notarize!
  expect(notarize['runs-on']).toBe('ubuntu-latest')
  expect(notarize.needs).toEqual(['validate', 'build'])
  expect(notarize['timeout-minutes']).toBe(360)
  expect(notarize.environment).toBe('desktop-${{ inputs.variant }}')
  expect(download(notarize).with).toEqual({ pattern: 'desktop-macos-notary-*', path: 'notary-submissions', 'merge-multiple': true })
  const poll = step('Poll Apple notarization until every submission is accepted')
  expect(stepsOf(notarize).indexOf(poll)).toBeGreaterThan(stepsOf(notarize).indexOf(download(notarize)))
  expect(poll.env).toEqual({
    APP_STORE_CONNECT_API_KEY_ID: '${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}',
    APP_STORE_CONNECT_API_ISSUER_ID: '${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}',
    APP_STORE_CONNECT_API_PRIVATE_KEY: '${{ secrets.APP_STORE_CONNECT_API_PRIVATE_KEY }}',
  })
  const [, deadline] = /^node --experimental-strip-types apps\/desktop\/scripts\/notary\.ts wait notary-submissions (\d+)$/.exec(poll.run!)!
  expect(Number(deadline)).toBeLessThan(360)
  expect(JSON.stringify(notarize)).not.toContain('notarytool')
  expect(JSON.stringify(notarize)).not.toContain('upload-artifact')
})

it('staples after notarization and publishes only the stapled macOS packages', () => {
  const staple = jobs.staple!
  expect(staple.needs).toEqual(['validate', 'notarize'])
  expect(staple['runs-on']).toBe('macos-15')
  expect(staple.environment).toBe('desktop-${{ inputs.variant }}')
  expect(staple.strategy!.matrix.target).toEqual(['aarch64-apple-darwin', 'x86_64-apple-darwin'])
  expect(download(staple).with).toEqual({ name: 'desktop-macos-signed-${{ matrix.target }}', path: '${{ runner.temp }}/macos-signed' })
  const upload = stapleSteps.find(entry => entry.uses?.startsWith('actions/upload-artifact@'))!
  const order = [download(staple), stapleStep('Restore the signed macOS bundle'),
    stapleStep('Staple the DMG and app, then rebuild the updater archive from the stapled app'),
    stapleStep('Verify macOS signatures, notarization and the push entitlement'), stapleStep('Collect the updater package'),
    stapleStep('Collect the production DMG'), stapleStep('Sign and verify the updater package'), upload].map(entry => stapleSteps.indexOf(entry))
  expect(order).toEqual([...order].sort((left, right) => left - right))
  expect(order.every(index => index >= 0)).toBe(true)
  expect(upload.with).toEqual({ name: 'desktop-release-${{ matrix.target }}', path: '${{ runner.temp }}/desktop-assets/*', 'if-no-files-found': 'error', 'retention-days': 14 })
  expect(stapleStep('Collect the production DMG').if).toBe("inputs.variant == 'production'")
  expect(jobs.publish!.needs).toEqual(['validate', 'build', 'staple'])
  expect(download(jobs.publish!).with).toMatchObject({ pattern: 'desktop-release-*' })
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
    TAURI_SIGNING_PRIVATE_KEY: 'updater' }
  const signed = run('Sign the macOS app and DMG', directory, bin, log, { ...credentials, DESKTOP_VARIANT: variant })
  expect(signed.result.status, signed.result.stderr).toBe(0)
  const signing = join(directory, 'tmp/macos-signing')
  expect(signed.commands).toEqual([['npm', 'run', `bundle:${variant}`, '--', '--config', 'release-config.json',
    '--config', join(signing, 'signing-config.json'), '--target', target, '--bundles', 'app,dmg', '--ci']])
  expect(JSON.parse(readFileSync(`${log}.env`, 'utf8'))).toEqual({})
  for (const missing of Object.keys(credentials)) {
    const failed = run('Sign the macOS app and DMG', directory, bin, log, { ...credentials, [missing]: '', DESKTOP_VARIANT: variant })
    expect(failed.result.status).not.toBe(0)
    expect(failed.result.stdout).toContain(`Missing ${missing}`)
    expect(failed.commands).toEqual([])
  }
})

const notaryKeys = { APP_STORE_CONNECT_API_KEY_ID: 'key', APP_STORE_CONNECT_API_ISSUER_ID: 'issuer' }

shellTest('submits the signed DMG once without waiting and records its submission id', () => {
  const { directory, bin, log } = fixture()
  const bundle = bundleFixture(directory)
  const submitted = run('Submit the DMG for notarization without waiting', directory, bin, log, {
    ...notaryKeys, FAKE_SUBMISSION: JSON.stringify({ id: submissionId }),
  })
  expect(submitted.result.status, submitted.result.stderr).toBe(0)
  const dmg = join(bundle, 'dmg/Orbit Staging_0.dmg').slice(directory.length + 1)
  expect(submitted.commands).toEqual([['xcrun', 'notarytool', 'submit', dmg, '--key', join(directory, 'tmp/macos-signing/AuthKey.p8'),
    '--key-id', 'key', '--issuer', 'issuer', '--no-wait', '--output-format', 'json']])
  expect(submitted.result.stdout).toBe(`${submissionId}\n`)
  expect(readSubmissionId(join(directory, `tmp/macos-notary/${submissionFile(target)}`))).toBe(submissionId)
  const unnamed = run('Submit the DMG for notarization without waiting', directory, bin, log, { ...notaryKeys, FAKE_SUBMISSION: '{}' })
  expect(unnamed.result.status).not.toBe(0)
  expect(unnamed.result.stderr).toContain('names no notary submission id')
  const rejected = run('Submit the DMG for notarization without waiting', directory, bin, log, {
    ...notaryKeys, FAKE_SUBMISSION: JSON.stringify({ id: submissionId }), FAKE_FAIL: '^xcrun notarytool submit',
  })
  expect(rejected.result.status).not.toBe(0)
  for (const missing of Object.keys(notaryKeys)) {
    const failed = run('Submit the DMG for notarization without waiting', directory, bin, log, { ...notaryKeys, [missing]: '', FAKE_SUBMISSION: '{}' })
    expect(failed.result.status).not.toBe(0)
    expect(failed.result.stdout).toContain(`Missing ${missing}`)
    expect(failed.commands).toEqual([])
  }
})

shellTest('refuses to notarize an ambiguous DMG output', () => {
  const { directory, bin, log } = fixture()
  bundleFixture(directory, undefined, 2)
  const notarized = run('Submit the DMG for notarization without waiting', directory, bin, log, { ...notaryKeys, FAKE_SUBMISSION: '{}' })
  expect(notarized.result.status).not.toBe(0)
  expect(notarized.commands).toEqual([])
})

const executable = (path: string) => (statSync(path).mode & 0o111) !== 0

shellTest.each(['staging', 'production'])('restores the signed %s bundle in the staple job with its permissions and App ID', (variant) => {
  const built = fixture()
  bundleFixture(built.directory)
  const archived = run('Archive the signed macOS bundle', built.directory, built.bin, built.log)
  expect(archived.result.status, archived.result.stderr).toBe(0)
  const restored = fixture()
  mkdirSync(join(restored.directory, 'tmp/macos-signed'))
  writeFileSync(join(restored.directory, 'tmp/macos-signed/bundle.tar'), readFileSync(join(built.directory, 'tmp/macos-signed/bundle.tar')))
  const config = variant === 'production' ? 'tauri.production.conf.json' : 'tauri.conf.json'
  mkdirSync(join(restored.directory, 'apps/desktop/src-tauri'), { recursive: true })
  writeFileSync(join(restored.directory, 'apps/desktop/src-tauri', config), readFileSync(new URL(`../src-tauri/${config}`, import.meta.url)))
  const githubEnv = join(restored.directory, 'github-env')
  const restore = run('Restore the signed macOS bundle', restored.directory, restored.bin, restored.log, { DESKTOP_VARIANT: variant, GITHUB_ENV: githubEnv })
  expect(restore.result.status, restore.result.stderr).toBe(0)
  const bundle = join(restored.directory, `apps/desktop/src-tauri/target/${target}/release/bundle`)
  expect(executable(join(bundle, 'macos/Orbit Staging.app/Contents/MacOS/orbit'))).toBe(true)
  expect(existsSync(join(bundle, 'macos/Orbit Staging.app.tar.gz'))).toBe(true)
  expect(readFileSync(join(bundle, 'dmg/Orbit Staging_0.dmg'), 'utf8')).toBe('dmg')
  const expected = variant === 'production' ? 'org.useorbit.desktop' : identifier
  expect(readFileSync(githubEnv, 'utf8')).toBe(`ORBIT_MACOS_IDENTIFIER=${expected}\n`)
})

const stapleName = 'Staple the DMG and app, then rebuild the updater archive from the stapled app'

shellTest('staples the DMG and app before rebuilding the updater archive from the stapled app', () => {
  const { directory, bin, log } = fixture()
  const bundle = bundleFixture(directory)
  const archive = join(bundle, 'macos/Orbit Staging.app.tar.gz')
  writeFileSync(`${archive}.sig`, 'signature of the unstapled archive')
  const stapled = run(stapleName, directory, bin, log)
  expect(stapled.result.status, stapled.result.stderr).toBe(0)
  const relative = (path: string) => join(bundle, path).slice(directory.length + 1)
  expect(stapled.commands).toEqual([
    ['xcrun', 'stapler', 'staple', relative('dmg/Orbit Staging_0.dmg')],
    ['xcrun', 'stapler', 'staple', relative('macos/Orbit Staging.app')],
  ])
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  expect(entries.every(entry => entry.startsWith('Orbit Staging.app'))).toBe(true)
  expect(entries.some(entry => entry.split('/').some(part => part.startsWith('._')))).toBe(false)
  const extracted = join(directory, 'extracted')
  mkdirSync(extracted)
  execFileSync('tar', ['-xzf', archive, '-C', extracted])
  expect(readFileSync(join(extracted, 'Orbit Staging.app/Contents/CodeResources'), 'utf8')).toBe('ticket')
  expect(executable(join(extracted, 'Orbit Staging.app/Contents/MacOS/orbit'))).toBe(true)
  expect(existsSync(`${archive}.sig`)).toBe(false)
})

shellTest.each([
  { item: 'DMG', fail: '^xcrun stapler staple .*\\.dmg$' },
  { item: 'app', fail: '^xcrun stapler staple .*\\.app$' },
])('keeps the unstapled updater archive when stapling the $item fails', ({ fail }) => {
  const { directory, bin, log } = fixture()
  const bundle = bundleFixture(directory)
  const archive = join(bundle, 'macos/Orbit Staging.app.tar.gz')
  const original = readFileSync(archive)
  const stapled = run(stapleName, directory, bin, log, { FAKE_FAIL: fail })
  expect(stapled.result.status).not.toBe(0)
  expect(readFileSync(archive).equals(original)).toBe(true)
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
    ['codesign', '-d', '--entitlements', '-', '--xml', path],
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
