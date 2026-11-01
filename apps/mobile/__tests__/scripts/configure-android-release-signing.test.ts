import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../../scripts/configure-android-release-signing.js', import.meta.url))
const fixtures = fileURLToPath(new URL('../fixtures/android-release-sdk58/', import.meta.url))
const directories: string[] = []
const fixturePassword = randomBytes(16).toString('hex')
const template = readFileSync(join(fixtures, 'app-build.gradle.fixture'), 'utf8')

function prepareProject(appGradle = template) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-release-signing-'))
  directories.push(directory)
  const projectFiles = [
    ['app/build.gradle', 'app-build.gradle.fixture'],
    ['build.gradle', 'root-build.gradle.fixture'],
    ['gradle.properties', 'gradle.properties.fixture'],
    ['app/src/main/AndroidManifest.xml', 'AndroidManifest.xml.fixture'],
  ] as const
  mkdirSync(join(directory, 'scripts'))
  copyFileSync(script, join(directory, 'scripts/configure-android-release-signing.js'))
  for (const [destination, fixture] of projectFiles) {
    const target = join(directory, 'android', destination)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(fixtures, fixture), target)
  }
  writeFileSync(join(directory, 'android/app/build.gradle'), appGradle)
  return directory
}

function configure(directory: string) {
  return spawnSync(process.execPath, ['scripts/configure-android-release-signing.js'], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      ANDROID_KEYSTORE_BASE64: Buffer.from('fixture-keystore').toString('base64'),
      ANDROID_KEYSTORE_PASSWORD: fixturePassword,
      ANDROID_KEY_ALIAS: 'fixture-alias',
      ANDROID_KEY_PASSWORD: fixturePassword,
    },
  })
}

function releaseBuildType(contents: string) {
  return contents.split('buildTypes {')[1]?.split('release {')[1]?.split('packagingOptions {')[0] ?? ''
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Android release signing configuration', () => {
  it.each([
    ['SDK 58', template],
    ['SDK 57 assignment', template.replaceAll('signingConfig = signingConfigs.debug', 'signingConfig signingConfigs.debug')],
    ['whitespace', template.replaceAll('signingConfig = signingConfigs.debug', 'signingConfig\t =\n\t signingConfigs.debug')],
  ])('signs the release build with the upload key for %s', (_name, contents) => {
    const directory = prepareProject(contents)
    const result = configure(directory)
    expect(result.status, result.stderr).toBe(0)
    const updated = readFileSync(join(directory, 'android/app/build.gradle'), 'utf8')
    expect(releaseBuildType(updated)).toMatch(/signingConfig\s*(?:=\s*)?signingConfigs\.release/)
    expect(releaseBuildType(updated)).not.toContain('signingConfigs.debug')
    expect(updated.split('buildTypes {')[1]?.split('release {')[0]).toContain('signingConfigs.debug')
    expect(updated.split('signingConfigs {')[1]?.split('buildTypes {')[0]).toContain('release {')
    expect(updated).toContain('entryFile = file("${projectRoot}/index.js")')
    expect(updated).toContain('rootProject.file("keystore.properties")')
    expect(readFileSync(join(directory, 'android/build.gradle'), 'utf8')).toContain('asyncStorageLocalRepo')
    expect(readFileSync(join(directory, 'android/gradle.properties'), 'utf8')).toContain('-Xmx6144m')
  })

  it('keeps one release signing configuration when run twice', () => {
    const directory = prepareProject()
    expect(configure(directory).status).toBe(0)
    const once = readFileSync(join(directory, 'android/app/build.gradle'), 'utf8')
    const result = configure(directory)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(directory, 'android/app/build.gradle'), 'utf8')).toBe(once)
  })

  it.each([
    ['release signingConfig', template.replace(/(release\s*\{[\s\S]*?)signingConfig = signingConfigs.debug/, '$1signingConfig = signingConfigs.other')],
    ['entryFile', template.replace("require('expo/scripts/resolveAppEntry')", "require('unknown-entry')")],
    ['signingConfigs', template.replace('    signingConfigs {', '    otherConfigs {')],
    ['buildTypes', template.replace('    buildTypes {', '    otherTypes {')],
    ['release buildType', template.replace('        release {', '        otherRelease {')],
    ['android block', template.replace('\nandroid {', '\notherAndroid {')],
  ])('fails with a named diagnostic when the %s anchor is missing', (anchor, contents) => {
    const directory = prepareProject(contents)
    const result = configure(directory)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(anchor)
  })

  it('fails when the root repositories anchor is missing', () => {
    const directory = prepareProject()
    const root = join(directory, 'android/build.gradle')
    writeFileSync(root, readFileSync(root, 'utf8').replace('allprojects {\n  repositories {', 'allprojects {\n  otherRepositories {'))
    const result = configure(directory)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('allprojects repositories')
  })

  it('requires the auth callback App Link rather than silently skipping verification', () => {
    const directory = prepareProject()
    const manifest = join(directory, 'android/app/src/main/AndroidManifest.xml')
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('/auth-callback', '/other-callback'))
    const result = configure(directory)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('auth-callback')
  })
})
