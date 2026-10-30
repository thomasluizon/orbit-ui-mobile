import { createServer, request } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { readFile } from 'node:fs/promises'
import { benchmarkViewport } from './build.mjs'

export async function startProxy({ token, probePath, port, upstreamPort, closeConversationLabel, tls, route, acceptance = false }) {
  let received = []
  let command = 'idle'
  let waiting = []
  let launch
  const probe = (await readFile(probePath, 'utf8'))
    .replaceAll('__BENCH_CLOSE_LABEL__', JSON.stringify(closeConversationLabel))
    .replaceAll('__BENCH_VIEWPORT__', JSON.stringify(benchmarkViewport))
  const handle = async (incoming, response) => {
    if (route?.(incoming, response)) return
    if (incoming.url === '/_bench/probe.js') {
      response.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' })
      response.end(acceptance ? probe : probe.replaceAll('__BENCH_READINESS_ONLY__', JSON.stringify(launch.readinessOnly))
        .replaceAll('__BENCH_NATIVE_WINDOW__', JSON.stringify(launch.nativeWindow)))
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
      if (command !== 'idle') {
        response.writeHead(200, { 'cache-control': 'no-store' }).end(command)
        if (acceptance) command = 'idle'
      }
      else waiting.push(response)
    } else {
      const failUpstream = (error) => {
        const method = incoming.method
        const path = incoming.url.split('?')[0]
        received.push({ kind: 'error', method, path, message: `Upstream ${method} ${path} failed: ${error.message}` })
        if (response.headersSent) response.destroy()
        else response.writeHead(502).end()
      }
      const proxy = request({ host: '127.0.0.1', port: upstreamPort, path: incoming.url, method: incoming.method,
        headers: { ...incoming.headers, host: tls ? incoming.headers.host : `127.0.0.1:${port}`, 'accept-encoding': 'identity',
          ...(token ? { cookie: `auth_token=${token}; i18n_locale=en` } : {}), ...(tls ? { 'x-forwarded-proto': 'https' } : {}) } }, (upstream) => {
        upstream.on('error', failUpstream)
        const headers = { ...upstream.headers }
        delete headers['content-length']
        delete headers['transfer-encoding']
        if (token) headers['set-cookie'] = [`auth_token=${token}; Path=/; HttpOnly; SameSite=Strict`, 'i18n_locale=en; Path=/; SameSite=Lax']
        if (acceptance) route.observe?.(incoming, upstream)
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
      proxy.on('error', failUpstream)
      incoming.pipe(proxy)
    }
  }
  const hosts = tls ? ['127.0.0.1', '::1'] : ['127.0.0.1']
  const servers = hosts.map(() => tls ? createSecureServer(tls, handle) : createServer(handle))
  const stop = async () => {
    for (const server of servers) server.closeAllConnections()
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
  }
  try {
    for (const [index, server] of servers.entries()) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, hosts[index], resolve) })
    }
  } catch (error) {
    await stop()
    throw error
  }
  return {
    reset(settings) { launch = settings; received = []; command = 'idle'; for (const response of waiting) response.destroy(); waiting = [] },
    workload() { command = 'workload'; for (const response of waiting) response.writeHead(200, { 'cache-control': 'no-store' }).end(command); waiting = [] },
    send(value) {
      if (waiting.length > 1) throw new Error('More than one acceptance page is polling')
      if (waiting.length) { waiting.shift().writeHead(200, { 'cache-control': 'no-store' }).end(value) }
      else command = value
    },
    events() { return received.slice() },
    read(kind) {
      const failure = received.find((entry) => entry.kind === 'error')
      if (failure) throw new Error(failure.message)
      return received.find((entry) => entry.kind === kind)
    },
    stop,
  }
}
