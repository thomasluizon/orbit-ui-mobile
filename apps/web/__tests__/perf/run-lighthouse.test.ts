// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertBudgets, config, runLighthouseGate, startProductionServer } from '../../perf/run-lighthouse.mjs'
import { readLcpValues } from '../../perf/report-lcp.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), launch: vi.fn(), connect: vi.fn(), audit: vi.fn(), warm: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }))
vi.mock('chrome-launcher', () => ({ launch: mocks.launch, default: { launch: mocks.launch } }))
vi.mock('puppeteer-core', () => ({ connect: mocks.connect, default: { connect: mocks.connect } }))
vi.mock('lighthouse', () => ({ default: mocks.audit }))
vi.mock('../../perf/warm-hermetic-auth.cjs', () => ({ default: mocks.warm }))

function report(blockingTime = 1000, scriptBytes = 800000) {
  return { audits: {
    'total-blocking-time': { numericValue: blockingTime },
    'resource-summary': { details: { items: [{ resourceType: 'script', label: 'Script', requestCount: 1, transferSize: scriptBytes }] } },
    'largest-contentful-paint': { numericValue: 9000 },
  } }
}

function serverProcess() {
  return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 123456, kill: vi.fn() })
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers() })

describe('Lighthouse median budgets', () => {
  it('asserts independent medians and preserves the five-run budget derivation', () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    expect(config.numberOfRuns).toBe(5)
    expect(config.thresholdDerivation.aggregation).toContain('median')
    assertBudgets([report(0, 900000), report(900, 810000), report(1000, 800000), report(5000, 700000), report(6000, 600000)])
    expect(output).toHaveBeenCalledWith('total-blocking-time median: 1000; budget: 1200\n')
    expect(output).toHaveBeenCalledWith('resource-summary:script:size median: 800000; budget: 820000\n')
  })

  it('accepts each exact budget and rejects either regressed median', () => {
    expect(() => assertBudgets(Array.from({ length: 5 }, () => report(1200, 820000)))).not.toThrow()
    expect(() => assertBudgets(Array.from({ length: 5 }, () => report(1201)))).toThrow('total-blocking-time median 1201 exceeds 1200')
    expect(() => assertBudgets(Array.from({ length: 5 }, () => report(1000, 820001)))).toThrow('resource-summary:script:size median 820001 exceeds 820000')
  })

  it('rejects incomplete reports and missing metrics', () => {
    expect(() => assertBudgets([report()])).toThrow('Expected 5 Lighthouse reports')
    expect(() => assertBudgets([report(NaN), ...Array.from({ length: 4 }, () => report())])).toThrow('finite, non-negative total-blocking-time')
    const missingScripts = report()
    missingScripts.audits['resource-summary'].details.items = []
    expect(() => assertBudgets([missingScripts, ...Array.from({ length: 4 }, () => report())])).toThrow('finite, non-negative resource-summary:script:size')
  })
})

it('waits for a readiness marker split across chunks and rejects an early exit', async () => {
  const server = serverProcess()
  mocks.spawn.mockReturnValue(server)
  const first = startProductionServer()
  server.stdout.emit('data', 'Rea')
  server.stdout.emit('data', 'dy in 100ms')
  await expect(first.ready).resolves.toBeUndefined()
  const second = startProductionServer()
  server.emit('exit', 1, null)
  await expect(second.ready).rejects.toThrow('exited before readiness: 1')
})

it.each([false, true])('warms shared Chrome, saves every report and cleans up after collection (regressed: %s)', async (regressed) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'orbit-perf-'))
  const previousDirectory = config.reportDirectory
  config.reportDirectory = path.relative(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), directory)
  const server = serverProcess()
  mocks.spawn.mockImplementation(() => { queueMicrotask(() => server.stdout.emit('data', 'Ready in 100ms')); return server })
  const chrome = { port: 9222, pid: 123455, process: server, kill: vi.fn().mockResolvedValue(undefined) }
  const browser = { disconnect: vi.fn().mockResolvedValue(undefined) }
  mocks.launch.mockResolvedValue(chrome)
  mocks.connect.mockResolvedValue(browser)
  mocks.audit.mockResolvedValue({ lhr: report(regressed ? 1300 : 1000), report: '<html></html>', artifacts: {} })
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  try {
    const running = runLighthouseGate()
    if (regressed) await expect(running).rejects.toThrow('exceeds 1200')
    else await running
    expect(mocks.warm).toHaveBeenCalledWith(browser, { url: 'http://127.0.0.1:3000/' })
    expect(mocks.warm.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]!)
    expect(mocks.audit).toHaveBeenCalledTimes(5)
    expect(mocks.audit).toHaveBeenCalledWith('http://127.0.0.1:3000/', { port: 9222, onlyCategories: ['performance'], output: 'html', logLevel: 'error' })
    expect(readdirSync(directory)).toHaveLength(10)
    expect(readLcpValues(directory)).toEqual([9000, 9000, 9000, 9000, 9000])
    expect(browser.disconnect).toHaveBeenCalledOnce()
    expect(chrome.kill).toHaveBeenCalledOnce()
    expect(kill).toHaveBeenCalledWith(-server.pid, 'SIGTERM')
  } finally {
    config.reportDirectory = previousDirectory
    rmSync(directory, { recursive: true, force: true })
  }
})
