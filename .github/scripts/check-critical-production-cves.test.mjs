import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const scriptPath = fileURLToPath(new URL('./check-critical-production-cves.mjs', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

function collect(stream) {
  let output = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    output += chunk
  })
  return () => output
}

test('reports a registry failure as infrastructure, not a CVE', async (context) => {
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

  const child = spawn(process.execPath, [scriptPath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NPM_CONFIG_REGISTRY: `http://127.0.0.1:${address.port}/`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = collect(child.stdout)
  const stderr = collect(child.stderr)
  const [exitCode] = await once(child, 'close')

  assert.equal(exitCode, 2)
  assert.deepEqual(requests, [
    { method: 'POST', url: '/-/npm/v1/security/advisories/bulk' },
  ])
  assert.match(stderr(), /Infrastructure error: npm registry or network failure/)
  assert.match(stderr(), /No CVE verdict was produced\./)
  assert.doesNotMatch(`${stdout()}${stderr()}`, /Critical production advisory found:/)
})
