import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { runGate } from './check-critical-production-cves.mjs'

const scriptPath = fileURLToPath(new URL('./check-critical-production-cves.mjs', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const productionCriticalReport = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    'form-data': {
      name: 'form-data',
      severity: 'critical',
      via: [
        {
          severity: 'critical',
          title: 'form-data uses unsafe random function in form-data for choosing boundary',
          url: 'https://github.com/advisories/GHSA-fjxv-7rqg-78g4',
        },
      ],
      nodes: ['node_modules/form-data'],
    },
  },
})
const devOnlyCriticalReport = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    orval: {
      name: 'orval',
      severity: 'critical',
      via: [
        {
          severity: 'critical',
          title:
            'Orval: Import-time RCE via query-parameter default -> zod module-level template literal',
          url: 'https://github.com/advisories/GHSA-p4cg-3328-rvfg',
        },
      ],
      nodes: ['node_modules/orval'],
    },
  },
})
const moderateOnlyReport = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    '@xmldom/xmldom': {
      name: '@xmldom/xmldom',
      severity: 'moderate',
      via: [],
      nodes: [
        'node_modules/@xmldom/xmldom',
        'node_modules/plist/node_modules/@xmldom/xmldom',
      ],
    },
    'decode-uri-component': {
      name: 'decode-uri-component',
      severity: 'moderate',
      via: [],
      nodes: ['node_modules/decode-uri-component'],
    },
    'expo-router': {
      name: 'expo-router',
      severity: 'moderate',
      via: ['query-string'],
      nodes: ['node_modules/expo-router'],
    },
    'query-string': {
      name: 'query-string',
      severity: 'moderate',
      via: ['decode-uri-component'],
      nodes: ['node_modules/query-string'],
    },
  },
})

function collect(stream) {
  let output = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    output += chunk
  })
  return () => output
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = collect(child.stdout)
  const stderr = collect(child.stderr)
  const [exitCode] = await once(child, 'close')
  return { exitCode, stderr: stderr(), stdout: stdout() }
}

test('fails and names a critical production advisory', () => {
  const result = runGate({
    runAudit: () => ({ error: null, status: 1, stderr: '', stdout: productionCriticalReport }),
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Critical production advisory found:/)
  assert.match(result.stderr, /form-data uses unsafe random function/)
  assert.match(result.stderr, /GHSA-fjxv-7rqg-78g4/)
})

test('passes when the only critical advisory is dev only', () => {
  const result = runGate({
    runAudit: () => ({ error: null, status: 1, stderr: '', stdout: devOnlyCriticalReport }),
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'Production audit passed: no critical vulnerabilities found.')
  assert.doesNotMatch(result.stderr, /Critical production advisory found:/)
})

test('passes the real moderate-only production tree', () => {
  const result = runGate({
    runAudit: () => ({ error: null, status: 0, stderr: '', stdout: moderateOnlyReport }),
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'Production audit passed: no critical vulnerabilities found.')
})

test('uses the second response when the first audit attempt fails', () => {
  const responses = [
    { error: null, status: 1, stderr: '503 Service Unavailable', stdout: '' },
    { error: null, status: 0, stderr: '', stdout: moderateOnlyReport },
  ]
  let attempts = 0
  const result = runGate({
    runAudit: () => responses[attempts++],
  })

  assert.equal(attempts, 2)
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'Production audit passed: no critical vulnerabilities found.')
  assert.match(result.stderr, /retrying once/)
})

test('reports two registry failures as infrastructure, not a CVE', async (context) => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    response.writeHead(503, { 'content-type': 'text/plain' })
    response.end('Service Unavailable')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => server.close())

  const address = server.address()
  assert(address && typeof address === 'object')

  const result = await run(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      NPM_CONFIG_REGISTRY: `http://127.0.0.1:${address.port}/`,
    },
  })

  assert.equal(result.exitCode, 2)
  assert.deepEqual(requests, [
    { method: 'POST', url: '/-/npm/v1/security/advisories/bulk' },
    { method: 'POST', url: '/-/npm/v1/security/advisories/bulk' },
  ])
  assert.match(result.stderr, /retrying once/)
  assert.match(result.stderr, /Infrastructure error: npm registry or network failure/)
  assert.match(result.stderr, /No CVE verdict was produced\./)
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Critical production advisory found:/)
})
