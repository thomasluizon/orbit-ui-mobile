import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { benchmarkViewport } from './build.mjs'

export async function startProxy({ token, probePath, port, upstreamPort, closeConversationLabel }) {
  let received = []
  let command = 'idle'
  let waiting = []
  const probe = (await readFile(probePath, 'utf8'))
    .replaceAll('__BENCH_CLOSE_LABEL__', JSON.stringify(closeConversationLabel))
    .replaceAll('__BENCH_VIEWPORT__', JSON.stringify(benchmarkViewport))
  const server = createServer(async (incoming, response) => {
    if (incoming.url === '/_bench/probe.js') {
      response.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' })
      response.end(probe)
    } else if (incoming.url === '/_bench/events') {
      try {
        const chunks = []
        for await (const chunk of incoming) chunks.push(chunk)
        received.push(JSON.parse(Buffer.concat(chunks).toString()))
        response.writeHead(204).end()
      } catch (error) {
        received.push({ kind: 'error', message: error.message })
        response.writeHead(400).end()
      }
    } else if (incoming.url === '/_bench/command') {
      if (command === 'workload') response.writeHead(200, { 'cache-control': 'no-store' }).end(command)
      else waiting.push(response)
    } else {
      const proxy = request({ host: '127.0.0.1', port: upstreamPort, path: incoming.url, method: incoming.method,
        headers: { ...incoming.headers, host: `127.0.0.1:${port}`, 'accept-encoding': 'identity', cookie: `auth_token=${token}; i18n_locale=en` } }, (upstream) => {
        const headers = { ...upstream.headers }
        delete headers['content-length']
        delete headers['transfer-encoding']
        headers['set-cookie'] = [`auth_token=${token}; Path=/; HttpOnly; SameSite=Strict`, 'i18n_locale=en; Path=/; SameSite=Lax']
        if (headers['content-type']?.includes('text/html')) {
          const chunks = []
          upstream.on('data', (chunk) => chunks.push(chunk))
          upstream.on('end', () => {
            const nonce = /'nonce-([^']+)'/.exec(String(headers['content-security-policy']))?.[1]
            if (!nonce) {
              received.push({ kind: 'error', message: 'Expected the hermetic page CSP nonce' })
              response.writeHead(502).end()
              return
            }
            const html = Buffer.concat(chunks).toString().replace('<head>', `<head><script nonce="${nonce}" src="/_bench/probe.js"></script>`)
            response.writeHead(upstream.statusCode, headers).end(html)
          })
        } else {
          response.writeHead(upstream.statusCode, headers)
          upstream.pipe(response)
        }
      })
      proxy.on('error', (error) => { received.push({ kind: 'error', message: error.message }); response.writeHead(502).end() })
      incoming.pipe(proxy)
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return {
    reset() { received = []; command = 'idle'; for (const response of waiting) response.destroy(); waiting = [] },
    workload() { command = 'workload'; for (const response of waiting) response.writeHead(200, { 'cache-control': 'no-store' }).end(command); waiting = [] },
    read(kind) {
      const failure = received.find((entry) => entry.kind === 'error')
      if (failure) throw new Error(failure.message)
      return received.find((entry) => entry.kind === kind)
    },
    async stop() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) },
  }
}
