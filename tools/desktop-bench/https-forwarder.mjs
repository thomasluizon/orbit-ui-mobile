import { createServer, createConnection } from 'node:net'

export async function forwardHttps(uid, gid) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(gid) || gid < 0) {
    throw new Error('HTTPS listener requires an unprivileged runner identity')
  }
  const sockets = new Set()
  const server = createServer()
  const close = () => {
    server.close()
    for (const socket of sockets) socket.destroy()
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(443, '127.0.0.1', resolve)
    })
    process.setgroups([])
    process.setgid(gid)
    process.setuid(uid)
    server.on('connection', (client) => {
      const upstream = createConnection({ host: '127.0.0.1', port: 3443 })
      for (const [socket, peer] of [[client, upstream], [upstream, client]]) {
        sockets.add(socket)
        socket.once('close', () => { sockets.delete(socket); peer.destroy() })
        socket.once('error', () => peer.destroy())
      }
      client.pipe(upstream).pipe(client)
    })
    process.stdin.once('end', close)
    process.stdin.resume()
    process.once('SIGTERM', close)
    process.stdout.write('listening\n')
  } catch (error) {
    close()
    throw error
  }
}
