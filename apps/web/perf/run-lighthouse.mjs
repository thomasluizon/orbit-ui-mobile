import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'
import lighthouse from 'lighthouse'
import { launch } from 'chrome-launcher'
import { connect } from 'puppeteer-core'
import warmHermeticAuth from './warm-hermetic-auth.cjs'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'))

export function assertBudgets(reports) {
  if (reports.length !== config.numberOfRuns) throw new Error(`Expected ${config.numberOfRuns} Lighthouse reports, found ${reports.length}`)
  const measurements = {
    'total-blocking-time': reports.map(report => report.audits['total-blocking-time']?.numericValue),
    'resource-summary:script:size': reports.map(report => report.audits['resource-summary']?.details?.items?.find(item => item.resourceType === 'script')?.transferSize),
  }
  const failures = []
  for (const [name, values] of Object.entries(measurements)) {
    if (!values.every(value => Number.isFinite(value) && value >= 0)) throw new Error(`Every report must contain a finite, non-negative ${name}`)
    const median = values.toSorted((left, right) => left - right)[Math.floor(values.length / 2)]
    process.stdout.write(`${name} median: ${median}; budget: ${config.budgets[name]}\n`)
    if (median > config.budgets[name]) failures.push(`${name} median ${median} exceeds ${config.budgets[name]}`)
  }
  if (failures.length) throw new Error(failures.join('; '))
}

export function startProductionServer() {
  const server = spawn(config.startServer.command, config.startServer.args, {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ready = new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error('Production server readiness timed out')), config.startServer.timeout)
    function observe(chunk) {
      process.stdout.write(chunk)
      output = (output + chunk.toString()).slice(-4096)
      if (output.includes(config.startServer.readyPattern)) { clearTimeout(timeout); resolve() }
    }
    server.stdout.on('data', observe)
    server.stderr.on('data', observe)
    server.once('error', error => { clearTimeout(timeout); reject(error) })
    server.once('exit', (code, signal) => {
      clearTimeout(timeout)
      reject(new Error(`Production server exited before readiness: ${code ?? signal}`))
    })
  })
  return { server, ready }
}

function stopServer(server) {
  if (!server.pid) return
  if (process.platform === 'win32') { server.kill(); return }
  try { process.kill(-server.pid, 'SIGTERM') } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

async function collectReports(browser, port, reportDirectory) {
  let reportIndex = 0
  const failures = []
  for (const url of config.urls) {
    await warmHermeticAuth(browser, { url })
    const reports = []
    for (let run = 0; run < config.numberOfRuns; run++) {
      const result = await lighthouse(url, { ...config.settings, port, output: 'html', logLevel: 'error' })
      if (!result) throw new Error(`Lighthouse returned no report for ${url}`)
      const reportName = path.join(reportDirectory, `lhr-${reportIndex++}`)
      writeFileSync(`${reportName}.json`, JSON.stringify(result.lhr))
      writeFileSync(`${reportName}.html`, result.report)
      if (result.lhr.runtimeError) throw new Error(`Lighthouse failed for ${url}: ${result.lhr.runtimeError.message}`)
      reports.push(result.lhr)
    }
    process.stdout.write(`Lighthouse budgets for ${url}\n`)
    try { assertBudgets(reports) } catch (error) { failures.push(`${url}: ${error.message}`) }
  }
  if (failures.length) throw new Error(failures.join('\n'))
}

export async function runLighthouseGate() {
  const reportDirectory = path.join(repositoryRoot, config.reportDirectory)
  mkdirSync(reportDirectory, { recursive: true })
  for (const name of readdirSync(reportDirectory)) {
    if (/^lhr-.*\.(json|html)$/.test(name)) unlinkSync(path.join(reportDirectory, name))
  }
  const { server, ready } = startProductionServer()
  let chrome
  let browser
  let cancelled = false
  const interrupted = () => { cancelled = true; stopServer(server); chrome?.kill(); process.exitCode = 1 }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  try {
    await ready
    if (cancelled) throw new Error('Lighthouse collection interrupted')
    chrome = await launch({ chromeFlags: ['--headless=new'], logLevel: 'error' })
    if (cancelled) throw new Error('Lighthouse collection interrupted')
    browser = await connect({ browserURL: `http://127.0.0.1:${chrome.port}` })
    await Promise.race([
      collectReports(browser, chrome.port, reportDirectory),
      new Promise((_, reject) => server.once('exit', (code, signal) => reject(new Error(`Production server exited during collection: ${code ?? signal}`)))),
    ])
  } finally {
    process.removeListener('SIGINT', interrupted)
    process.removeListener('SIGTERM', interrupted)
    try { await browser?.disconnect() } finally {
      try { await chrome?.kill() } finally { stopServer(server) }
    }
  }
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '')) {
  runLighthouseGate().catch(error => { process.stderr.write(`Lighthouse budget failed: ${error.message}\n`); process.exitCode = 1 })
}
