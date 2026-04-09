const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

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

const child = spawn('npx', ['expo', 'run:android'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ...(sdkPath
      ? {
          ANDROID_HOME: sdkPath,
          ANDROID_SDK_ROOT: sdkPath,
        }
      : {}),
    EXPO_NO_METRO_WORKSPACE_ROOT: '1',
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

