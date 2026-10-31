import { createSocket } from 'node:dgram'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function loopbackDnsReply(query) {
  if (query.length < 12 || query[2] & 0xf8 || query.readUInt16BE(4) !== 1) return null
  const labels = []
  let cursor = 12
  while (cursor < query.length && query[cursor] !== 0) {
    const length = query[cursor++]
    if (length > 63 || cursor + length >= query.length) return null
    labels.push(query.toString('ascii', cursor, cursor + length))
    cursor += length
  }
  if (cursor + 5 > query.length || cursor - 12 > 254) return null
  const hostname = labels.join('.').toLowerCase()
  const type = query.readUInt16BE(cursor + 1)
  const internet = query.readUInt16BE(cursor + 3) === 1
  const known = ['app-staging.useorbit.org', 'github.com'].includes(hostname)
  const address = known && internet ? type === 1 ? Buffer.from([127, 0, 0, 1])
    : type === 28 ? Buffer.from('00000000000000000000000000000001', 'hex') : null : null
  const header = Buffer.alloc(12)
  header.writeUInt16BE(query.readUInt16BE(0), 0)
  header.writeUInt16BE(0x8400 | (query.readUInt16BE(2) & 0x0100) | (known ? 0 : 3), 2)
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(address ? 1 : 0, 6)
  const answer = Buffer.alloc(address ? 12 + address.length : 0)
  if (address) {
    answer.writeUInt16BE(0xc00c, 0)
    answer.writeUInt16BE(type, 2)
    answer.writeUInt16BE(1, 4)
    answer.writeUInt16BE(address.length, 10)
    address.copy(answer, 12)
  }
  return { hostname, type, response: Buffer.concat([header, query.subarray(12, cursor + 5), answer]) }
}

export async function startLoopbackDns(output) {
  const socket = createSocket('udp4')
  const queries = []
  const errors = []
  socket.on('error', (error) => { errors.push(error.message) })
  socket.on('message', (query, peer) => {
    const reply = loopbackDnsReply(query)
    if (!reply) return
    queries.push({ hostname: reply.hostname, type: reply.type })
    socket.send(reply.response, peer.port, peer.address, (error) => { if (error) errors.push(error.message) })
  })
  const record = () => writeFile(join(output, 'origin-isolation-dns-responder.log'), `${JSON.stringify({ queries, errors }, null, 2)}\n`)
  try {
    await new Promise((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(0, '127.0.0.1', resolve)
    })
  } catch (error) {
    const failures = [error]
    try { await new Promise((resolve) => socket.close(resolve)) } catch (closeError) { failures.push(closeError) }
    try { await record() } catch (recordError) { failures.push(recordError) }
    if (failures.length > 1) throw new AggregateError(failures, error.message)
    throw error
  }
  return { port: socket.address().port, record, async stop() {
    await new Promise((resolve) => socket.close(resolve))
    await record()
    if (errors.length) throw new Error(`Loopback DNS responder failed: ${errors.join('; ')}`)
  } }
}
