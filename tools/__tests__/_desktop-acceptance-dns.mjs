import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { loopbackDnsReply } from '../desktop-bench/loopback-dns.mjs'
import { T, REPO_ROOT } from './_harness.mjs'

function dnsQuery(hostname, type) {
  const header = Buffer.from('5a7c01000001000000000000', 'hex')
  const question = Buffer.concat(hostname.split('.').map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])))
  const suffix = Buffer.from([0, 0, type, 0, 1])
  return Buffer.concat([header, question, suffix])
}

function dnsPacketCases() {
  for (const hostname of ['app-staging.useorbit.org', 'github.com', 'GITHUB.COM']) {
    for (const type of [1, 28, 65]) {
      const query = dnsQuery(hostname, type)
      const reply = loopbackDnsReply(query)
      const expected = type === 1 ? '7f000001' : type === 28 ? '00000000000000000000000000000001' : ''
      T(`loopback DNS ${hostname} type ${type} preserves the transaction and question with authoritative loopback answers`,
        reply.hostname === hostname.toLowerCase() && reply.type === type && reply.response.readUInt16BE(0) === 0x5a7c &&
        reply.response.readUInt16BE(2) === 0x8500 && reply.response.subarray(12, query.length).equals(query.subarray(12)) &&
        reply.response.readUInt16BE(6) === (type === 65 ? 0 : 1) &&
        reply.response.subarray(query.length + 12).toString('hex') === expected)
      if (type !== 65) T('loopback DNS answers expire immediately and preserve the requested address family',
        reply.response.readUInt32BE(query.length + 6) === 0 && reply.response.readUInt16BE(query.length + 2) === type)
    }
  }
  const unknown = loopbackDnsReply(dnsQuery('unrelated.example', 1))
  T('loopback DNS never forwards unowned names to a public resolver', unknown.response.readUInt16BE(2) === 0x8503 && unknown.response.readUInt16BE(6) === 0)
  const compressed = dnsQuery('github.com', 1)
  compressed[12] = 0xc0
  const multiple = dnsQuery('github.com', 1)
  multiple.writeUInt16BE(2, 4)
  const response = dnsQuery('github.com', 1)
  response[2] |= 0x80
  for (const malformed of [Buffer.alloc(0), Buffer.alloc(12), compressed, multiple, response, dnsQuery('github.com', 28).subarray(0, -1)]) {
    T('loopback DNS ignores malformed, compressed, multiple-question and response packets', loopbackDnsReply(malformed) === null)
  }
}

async function dnsLifecycleCases() {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/loopback-dns.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replaceAll('export ', '')
  for (const failurePoint of [undefined, 'bind', 'send', 'runtime']) {
    const socket = new EventEmitter()
    const calls = []
    const files = new Map()
    const failure = new Error(`DNS ${failurePoint} failure`)
    socket.bind = (port, address, ready) => { calls.push(['bind', port, address]); if (failurePoint === 'bind') socket.emit('error', failure); else ready() }
    socket.address = () => ({ address: '127.0.0.1', family: 'IPv4', port: 53535 })
    socket.close = (closed) => { calls.push(['close']); closed?.() }
    socket.send = (reply, port, address, sent) => { calls.push(['send', reply, port, address]); sent(failurePoint === 'send' ? failure : null) }
    const context = { Buffer, join, createSocket: (type) => { calls.push(['socket', type]); return socket },
      writeFile: async (path, content) => { files.set(path, JSON.parse(content)) },
    }
    runInNewContext(`${source}\nglobalThis.startLoopbackDns = startLoopbackDns`, context)
    let responder
    let rejected
    try { responder = await context.startLoopbackDns('output') } catch (error) { rejected = error }
    if (responder) {
      const query = dnsQuery('github.com', 28)
      socket.emit('message', query, { address: '127.0.0.1', family: 'IPv4', port: 53001, size: query.length })
      if (failurePoint === 'runtime') socket.emit('error', failure)
      await responder.record()
      try { await responder.stop() } catch (error) { rejected = error }
      const sent = calls.find(([operation]) => operation === 'send')
      T('owned DNS listener replies to the requesting loopback endpoint', responder.port === 53535 && sent[2] === 53001 && sent[3] === '127.0.0.1' &&
        sent[1].subarray(-16).toString('hex') === '00000000000000000000000000000001')
    }
    const diagnostics = files.get(join('output', 'origin-isolation-dns-responder.log'))
    T('DNS setup, delivery and runtime failures retain diagnostics and release the owned listener',
      JSON.stringify(calls.slice(0, 2)) === JSON.stringify([['socket', 'udp4'], ['bind', 0, '127.0.0.1']]) && calls.at(-1)[0] === 'close' &&
      diagnostics.queries.length === (failurePoint === 'bind' ? 0 : 1) && (failurePoint ? rejected?.message.includes(failure.message) : !rejected))
  }
}

export async function dnsCases() {
  dnsPacketCases()
  await dnsLifecycleCases()
}
