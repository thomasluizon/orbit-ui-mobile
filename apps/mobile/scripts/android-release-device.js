const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const androidDir = path.join(projectRoot, 'android')
const apkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
)

const appId = 'org.useorbit.app'
const activityName = 'org.useorbit.app.MainActivity'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
      cwd: options.cwd,
      env: options.env,
    })

    let stdout = ''
    let stderr = ''

    if (options.captureOutput) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
    }

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with exit code ${code}${
            stderr ? `\n${stderr.trim()}` : ''
          }`,
        ),
      )
    })
  })
}

async function getConnectedDeviceId() {
  const { stdout } = await run('adb', ['devices'], { captureOutput: true })
  const deviceLines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached'))
    .filter((line) => /\sdevice$/.test(line))

  if (deviceLines.length === 0) {
    throw new Error('No connected Android device found via adb.')
  }

  if (deviceLines.length > 1) {
    throw new Error(
      `Multiple adb devices detected. Disconnect extras or set a single target.\n${deviceLines.join('\n')}`,
    )
  }

  return deviceLines[0].split(/\s+/)[0]
}

async function waitForPid(deviceId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { stdout } = await run('adb', ['-s', deviceId, 'shell', 'pidof', '-s', appId], {
      captureOutput: true,
    })
    const pid = stdout.trim()
    if (pid) return pid
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${appId} process to start.`)
}

async function main() {
  const deviceId = await getConnectedDeviceId()

  console.log(`Using adb device: ${deviceId}`)
  console.log('Syncing Android native resources from Expo config...')

  await run('cmd.exe', ['/c', 'npx', 'expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    },
  })

  console.log('Building release APK with Gradle...')

  await run('cmd.exe', ['/c', 'gradlew.bat', 'assembleRelease'], {
    cwd: androidDir,
    env: {
      ...process.env,
      EXPO_NO_METRO_WORKSPACE_ROOT: '1',
    },
  })

  if (!fs.existsSync(apkPath)) {
    throw new Error(`Release APK not found at ${apkPath}`)
  }

  console.log(`Installing APK: ${apkPath}`)
  await run('adb', ['-s', deviceId, 'install', '-r', apkPath])

  console.log(`Launching ${activityName}...`)
  await run('adb', ['-s', deviceId, 'shell', 'am', 'start', '-n', `${appId}/${activityName}`])

  const pid = await waitForPid(deviceId)
  console.log(`Attached to PID ${pid}. Streaming logs. Press Ctrl+C to stop.`)

  const logcat = spawn(
    'adb',
    ['-s', deviceId, 'logcat', '--pid', pid, '-v', 'color', 'ReactNativeJS:I', 'ReactNative:I', '*:S'],
    {
      stdio: 'inherit',
      shell: false,
    },
  )

  logcat.on('close', (code) => {
    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
