import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { T, REPO_ROOT } from './_harness.mjs'

const catalog = (path, locale) => JSON.parse(readFileSync(join(REPO_ROOT, path, `${locale}.json`), 'utf8'))

// Runs the real pushPhase from the runner source; exercisePush and every process call are recorded fakes.
async function runPushPhase({ platform = 'darwin', exercise = async () => {}, alive = new Set(), killFailure, signature, signed = false, collectFailure } = {}) {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const phase = source.slice(source.indexOf('async function catalogValue('), source.indexOf('function menuCommands('))
  const calls = []
  const report = {}
  const context = {
    Set, Error, Promise, JSON, Intl, Date, readFile, join, dirname, directory: join(REPO_ROOT, 'tools/desktop-bench'), windows: platform === 'win32',
    process: {
      platform, stdout: { write: (text) => calls.push(`stdout ${text.trim()}`) },
      kill(pid, signal) {
        calls.push(`kill ${pid} ${signal}`)
        if (signal === 0 && !alive.has(pid)) throw Object.assign(new Error(`kill ESRCH ${pid}`), { code: 'ESRCH' })
        if (killFailure?.signal === signal) throw Object.assign(new Error(killFailure.message), { code: 'EPERM' })
      },
    },
    stop: async (handle) => { calls.push(`stop ${handle.name}`) },
    execute: async (command, argumentsList) => {
      calls.push(`execute ${command} ${argumentsList.join(' ')}`)
      if (killFailure?.signal === 'taskkill') throw new Error(killFailure.message)
      return ''
    },
    record: async (path) => { calls.push(`record ${path}`) },
    signedApsEnvironment: async (application, output) => {
      calls.push(`codesign ${application} ${output}`)
      return signature ?? { signature: { status: 0, stdout: '', stderr: '' }, environment: null }
    },
    pushSender: async (transport, registration, credentials, environment) => { calls.push(`sender ${transport} ${environment}`) },
    exercisePush: async (io) => {
      calls.push('exercise')
      context.io = io
      return exercise(io)
    },
    collectUnsupportedPush: async (output) => {
      calls.push(`collect ${output}`)
      if (collectFailure) throw collectFailure
    },
  }
  for (const name of ['installedLaunch', 'waitFor', 'delay', 'mockApi']) context[name] = () => { throw new Error(`${name} is outside this phase test`) }
  runInNewContext(`${phase}\nglobalThis.pushPhase = pushPhase`, context)
  const credentials = { ORBIT_APNS_KEY_ID: 'fixture-key' }
  let failure
  try {
    await context.pushPhase({
      proxy: {}, native: async () => ({}), handle: { name: 'valid-update' }, report, credentials, signed,
      updates: { mode: (mode) => calls.push(`update ${mode}`) },
      executable: platform === 'win32' ? 'C:\\Orbit\\Orbit Staging.exe' : '/Applications/Orbit Staging.app/Contents/MacOS/orbit',
      output: '/output', checkpoint: (event) => calls.push(`checkpoint ${event}`),
    })
  } catch (error) {
    failure = error
  }
  return { calls, report, failure, io: context.io, credentials }
}

async function unsupportedCollection(logs) {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const block = source.slice(source.indexOf('const unsupportedLine'), source.indexOf('async function quit(')).replace('export ', '')
  const appended = []
  const context = { join, readFile: async () => { throw new Error('the real file system is outside this test') }, appendFile: async () => {} }
  runInNewContext(`${block}\nglobalThis.collect = collectUnsupportedPush`, context)
  const report = { launchContexts: Object.fromEntries(Object.keys(logs).map((name) => [name, {}])), push: { transport: 'wns' } }
  const read = async (path) => {
    const name = path.slice('/output/'.length, -'.log'.length)
    if (logs[name] === undefined) throw Object.assign(new Error(`ENOENT ${path}`), { code: 'ENOENT' })
    return logs[name]
  }
  await context.collect('/output', report, read, async (path, text) => { appended.push({ path, text }) })
  return { report, appended }
}

export async function pushPhaseCases() {
  const line = 'Desktop push: native push unsupported: setting=Unsupported isSupported=true elevated=true'
  const gathered = await unsupportedCollection({ installed: `Desktop push: cannot refresh native permission\r\n${line}\r\n`, 'update-bad': 'Cannot download desktop update\n', push: `${line}\n` })
  T('the runner gathers each launch first unsupported line into the report and copies the earlier ones into push.log',
    JSON.stringify(gathered.report.push.nativeUnsupported) === JSON.stringify([{ log: 'installed.log', line }, { log: 'push.log', line }]) &&
      gathered.report.push.transport === 'wns' && gathered.appended.length === 1 && gathered.appended[0].path === join('/output', 'push.log') &&
      gathered.appended[0].text === `[installed.log] ${line}\n`, JSON.stringify(gathered))
  const quiet = await unsupportedCollection({ installed: 'Desktop push: cannot refresh native permission\n' })
  T('the runner leaves push.log and the report unchanged when no launch answered unsupported',
    quiet.appended.length === 0 && !('nativeUnsupported' in quiet.report.push))

  const labels = ['en', 'pt-BR'].map((locale) => catalog('packages/shared/src/i18n', locale).profile.settingsRows.alertsOnThisDevice)
  const done = await runPushPhase()
  T('push phase reads the Perfil switch labels from both shared catalogs and the Done label from the English desktop catalog',
    JSON.stringify(done.io.labels) === JSON.stringify(labels) && labels.every((label) => typeof label === 'string' && label.trim()) &&
      done.io.doneLabel === catalog('apps/desktop/locales', 'en').reminderDone && done.io.credentials === done.credentials, JSON.stringify(done.io?.labels))
  T('push phase serves no update, stops the valid-update launch, exercises push and then gathers every launch log',
    done.calls.slice(0, 5).join(',') === 'update off,stop valid-update,checkpoint push,exercise,collect /output' && !done.failure && done.io.signed === false,
    done.calls.join(','))
  const signedBuild = await runPushPhase({ signed: true })
  T('push phase tells push readiness that the build carries a Developer ID signature', signedBuild.io.signed === true)
  const phaseError = new Error('Timed out waiting for the enabled Perfil notification switch')
  const collected = await runPushPhase({ exercise: async () => { throw phaseError }, collectFailure: new Error('collect failed') })
  T('push phase gathers the unsupported lines after a failed phase and keeps the phase failure first',
    collected.failure === phaseError && collected.calls.includes('collect /output'))
  const collectOnly = await runPushPhase({ collectFailure: new Error('collect failed') })
  T('push phase fails when the launch logs cannot be gathered after a passing phase', collectOnly.failure?.message === 'collect failed')
  await done.io.record('notification-done', {})
  T('push phase writes each notification capture into the trees artifact folder', done.calls.at(-1) === `record ${join('/output', 'trees', 'notification-done.json')}`)

  const unsigned = await runPushPhase({ signature: { signature: { status: 1, stdout: '', stderr: 'code object is not signed at all' }, environment: null } })
  T('push phase reads the bundle code signature and keeps an unsigned codesign error in the report',
    await unsigned.io.apsEnvironment() === null && unsigned.calls.includes('codesign /Applications/Orbit Staging.app /output') &&
      unsigned.report.pushCodeSignature === 'code object is not signed at all')
  const signed = await runPushPhase({ signature: { signature: { status: 0, stdout: '<plist/>', stderr: '' }, environment: 'production' } })
  await signed.io.apsEnvironment()
  await signed.io.sender('apns', {})
  T('push phase signs APNs requests for the entitlement environment it read', signed.calls.includes('sender apns production') && !('pushCodeSignature' in signed.report))

  const adoptBoth = async (io) => { io.adopt(77); io.adopt(78) }
  const mac = await runPushPhase({ exercise: adoptBoth, alive: new Set([77]) })
  T('push phase kills only a live adopted macOS shell and skips one that already exited',
    !mac.failure && mac.calls.includes('kill 77 SIGKILL') && mac.calls.includes('kill 78 0') && !mac.calls.includes('kill 78 SIGKILL') && !('pushCleanupErrors' in mac.report),
    mac.calls.join(','))
  const windows = await runPushPhase({ platform: 'win32', exercise: adoptBoth, alive: new Set([77]) })
  T('push phase stops a live adopted Windows shell and its children through taskkill',
    !windows.failure && windows.calls.filter((call) => call.startsWith('execute')).join(',') === 'execute taskkill.exe /PID 77 /T /F', windows.calls.join(','))

  const phaseFailure = new Error('Timed out waiting for the sign-in page after an expired-session Done')
  const both = await runPushPhase({ exercise: async (io) => { io.adopt(77); throw phaseFailure }, alive: new Set([77]), killFailure: { signal: 'SIGKILL', message: 'kill EPERM 77' } })
  T('push phase throws the phase failure before a cleanup failure and still reports the cleanup failure',
    both.failure === phaseFailure && JSON.stringify(both.report.pushCleanupErrors) === '["kill EPERM 77"]' && both.calls.includes('kill 77 SIGKILL'))
  const cleanupOnly = await runPushPhase({ exercise: async (io) => { io.adopt(77) }, alive: new Set([77]), killFailure: { signal: 0, message: 'kill EPERM 77' } })
  T('push phase fails on a cleanup failure after a passing phase',
    /^Push acceptance cleanup failed: kill EPERM 77$/.test(cleanupOnly.failure?.message ?? '') && !cleanupOnly.calls.includes('kill 77 SIGKILL'), cleanupOnly.failure?.message)
}
