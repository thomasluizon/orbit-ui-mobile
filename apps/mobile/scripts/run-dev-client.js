const { spawn, spawnSync } = require('child_process')

function ensureAdbReverse(port) {
  const devices = spawnSync('adb', ['devices'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
  })

  if (devices.status !== 0) {
    return
  }

  const onlineDevices = devices.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached'))
    .filter((line) => /\sdevice$/.test(line))
    .map((line) => line.split(/\s+/)[0])

  for (const deviceId of onlineDevices) {
    spawnSync('adb', ['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`], {
      stdio: 'ignore',
      shell: false,
    })
  }
}

ensureAdbReverse(8081)

const child = spawn('npx', ['expo', 'start', '--dev-client', '--localhost'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    EXPO_NO_METRO_WORKSPACE_ROOT: '1',
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
