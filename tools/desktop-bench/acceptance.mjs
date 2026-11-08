import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `Usage: node tools/desktop-bench/acceptance.mjs --output <absolute-directory-outside-repository>
Run installed desktop acceptance on a disposable GitHub macOS or Windows VM.
Builds the release shell without optional features, uses only hermetic services, records the screen,
and writes install, email cookie, signed update, repeat reminder push and platform accessibility evidence.
--output  Artifact directory outside the repository. No stdin.
Optional push credentials come only from ORBIT_WNS_TENANT_ID, ORBIT_WNS_CLIENT_ID, ORBIT_WNS_CLIENT_SECRET,
ORBIT_APNS_KEY_ID, ORBIT_APPLE_TEAM_ID and ORBIT_APNS_PRIVATE_KEY; a missing one is a reported push skip.
--help, -h  Print usage. Exit 0: passed; 1: acceptance failed; 2: invalid input.
`
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argumentsList = process.argv.slice(2)
if (argumentsList.includes('--help') || argumentsList.includes('-h')) { process.stdout.write(usage); process.exit(0) }
const output = argumentsList[1] && resolve(argumentsList[1])
if (argumentsList.length !== 2 || argumentsList[0] !== '--output' || !isAbsolute(argumentsList[1]) ||
    output === repository || output.startsWith(`${repository}${sep}`)) {
  process.stderr.write(usage)
  process.exit(2)
}
try {
  if (process.env.GITHUB_ACTIONS !== 'true' || !['darwin', 'win32'].includes(process.platform)) {
    throw new Error('Acceptance requires a disposable GitHub macOS or Windows VM')
  }
  // Push credentials leave the environment before the build, web server or shell can inherit them.
  const { takePushCredentials } = await import('./acceptance-push.mjs')
  const credentials = takePushCredentials(process.env)
  const { acceptance } = await import('./acceptance-runner.mjs')
  await acceptance({ repository, output, credentials })
} catch (error) {
  process.stderr.write(`${error.stack}\n`)
  process.exitCode = 1
}
