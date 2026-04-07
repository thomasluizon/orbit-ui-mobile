const { spawn } = require('child_process')

const child = spawn('npx', ['expo', 'run:android'], {
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

