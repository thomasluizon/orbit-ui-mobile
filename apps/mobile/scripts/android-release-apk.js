const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { resolveTestBuildAdMobEnv } = require('./test-build-admob-env')

const USAGE = `android-release-apk.js - build a local release APK

Usage:
  node scripts/android-release-apk.js [--emulator]

Options:
  --emulator  Also build the x86_64 slice so the APK installs on an Android emulator.
              Production keeps app.json's ARM-only buildArchs; this overrides the
              generated gradle.properties for this build only.
  --help, -h  Print this usage and exit 0.

Exit codes:
  0  the APK was built
  1  prebuild or Gradle failed
  2  unknown argument
`

const args = process.argv.slice(2)
let emulator = false
for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    process.stdout.write(USAGE)
    process.exit(0)
  } else if (arg === '--emulator') {
    emulator = true
  } else {
    process.stderr.write(`android-release-apk: unknown argument: ${arg}\n`)
    process.exit(2)
  }
}

process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'
Object.assign(process.env, resolveTestBuildAdMobEnv(process.env))
process.env.SENTRY_DISABLE_AUTO_UPLOAD = 'true'

console.log('Local build uses Google TEST AdMob units and skips the Sentry source-map upload; real-ad releases ship via .github/workflows/android-release.yml.')

const projectRoot = path.join(__dirname, '..')
const androidDir = path.join(__dirname, '..', 'android')
const autolinkingCacheDir = path.join(androidDir, 'build', 'generated', 'autolinking')
const cmakeBuildDir = path.join(os.tmpdir(), 'orbit-mobile-cxx')

const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')

function resolveAndroidSdkPath() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
      : null,
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk')
      : null,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean)

  return candidates.find((candidate) => fs.existsSync(candidate))
}

const sdkPath = resolveAndroidSdkPath()

if (sdkPath) {
  process.env.ANDROID_HOME = sdkPath
  process.env.ANDROID_SDK_ROOT = sdkPath
}

/**
 * `expo prebuild` deletes and recreates android/. On Windows a live Gradle daemon
 * holds that directory open and prebuild dies with `EBUSY: resource busy or locked`,
 * so stop the daemons first. Failure here is not fatal: a run with no daemon at all
 * is the normal case.
 */
if (fs.existsSync(gradlew)) {
  spawnSync(gradlew, ['--stop'], { shell: true, cwd: androidDir, stdio: 'ignore', env: process.env })
}

execSync('npx expo prebuild --platform android --no-install', {
  shell: true,
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
})

fs.rmSync(autolinkingCacheDir, { recursive: true, force: true })

const normalizedCmakeBuildDir = cmakeBuildDir.split(path.sep).join('/')

const gradleArgs = [
  'assembleRelease',
  `-Porbit.cmakeBuildStagingDirectory="${normalizedCmakeBuildDir}"`,
]

if (emulator) {
  // gradle.properties documents this override; app.json stays ARM-only for Play.
  gradleArgs.push('-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64')
  console.log('Emulator build: adding the x86_64 ABI on top of app.json buildArchs.')
}

execSync(`"${gradlew}" ${gradleArgs.join(' ')}`, {
  shell: true,
  cwd: androidDir,
  stdio: 'inherit',
  env: process.env,
})

const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
console.log(`APK: ${apkPath}`)
