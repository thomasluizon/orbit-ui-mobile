const { execSync } = require('child_process')
const path = require('path')

process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1'

const androidDir = path.join(__dirname, '..', 'android')

const gradlew = path.join(androidDir, 'gradlew.bat')

execSync(`"${gradlew}" assembleRelease`, {
  shell: true,
  cwd: androidDir,
  stdio: 'inherit',
  env: process.env,
})
