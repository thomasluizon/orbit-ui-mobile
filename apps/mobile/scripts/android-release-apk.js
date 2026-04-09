const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const projectRoot = path.join(__dirname, '..')
const androidDir = path.join(__dirname, '..', 'android')

const gradlew = path.join(androidDir, 'gradlew.bat')

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

execSync('npx expo prebuild --platform android --no-install', {
  shell: true,
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
})

execSync(`"${gradlew}" assembleRelease`, {
  shell: true,
  cwd: androidDir,
  stdio: 'inherit',
  env: process.env,
})
