import { EventEmitter } from 'node:events'
import { createRequire, Module } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/chat/stream/route'
import { resolveServerSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({ resolveServerSession: vi.fn(), getAccountIdFromToken: () => 'account-a' }))
const originalTitle = process.title
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); process.title = originalTitle })

const require = createRequire(import.meta.url)
const filename = require.resolve('next/dist/server/lib/start-server')
const requireNext = createRequire(filename)

function loadStandaloneModule(modules: Record<string, unknown>) {
  const savedModules = new Map<string, NodeJS.Module | undefined>()
  for (const [name, exports] of Object.entries(modules)) {
    const resolved = requireNext.resolve(name)
    savedModules.set(resolved, require.cache[resolved])
    const replacement = new Module(resolved)
    replacement.exports = exports
    require.cache[resolved] = replacement
  }
  savedModules.set(filename, require.cache[filename])
  delete require.cache[filename]
  try {
    return require(filename) as typeof import('next/dist/server/lib/start-server')
  } finally {
    for (const [resolved, original] of savedModules) {
      if (original) require.cache[resolved] = original
      else delete require.cache[resolved]
    }
  }
}

function loadStandaloneShutdown() {
  const processEvents = Object.assign(new EventEmitter(), { env: {}, exit: vi.fn() })
  let completeResponses: (() => void) | undefined
  const listener = Object.assign(new EventEmitter(), {
    address: () => null,
    listen: () => queueMicrotask(() => listener.emit('listening')),
    close: vi.fn((callback: () => void) => { completeResponses = callback }),
    closeAllConnections: vi.fn(),
  })
  const closeRuntime = vi.fn(async () => {})
  const modules: Record<string, unknown> = {
    './cpu-profile': {}, '../next': {}, '../require-hook': {},
    http: { createServer: () => listener },
    './app-info-log': { logStartInfo: vi.fn() },
    '../../trace': { flushAllTraces: vi.fn() },
    './router-server': { initialize: async () => ({
      requestHandler: vi.fn(), upgradeHandler: vi.fn(), server: { close: closeRuntime },
      closeUpgraded: vi.fn(), distDir: '.next', devMemoryThresholdRestart: false,
    }) },
  }
  const exports = loadStandaloneModule(modules)
  vi.spyOn(process, 'on').mockImplementation((event, callback) => { processEvents.on(event, callback); return process })
  vi.spyOn(process, 'exit').mockImplementation((code) => { processEvents.exit(code); return undefined as never })
  vi.stubEnv('NEXT_MANUAL_SIG_HANDLE', '')
  vi.stubEnv('PORT', process.env.PORT)
  vi.stubEnv('__NEXT_PRIVATE_ORIGIN', process.env.__NEXT_PRIVATE_ORIGIN)
  return { exports, processEvents, listener, closeRuntime, finish: () => completeResponses?.() }
}

it('lets active responses finish after SIGTERM before closing the standalone runtime', async () => {
  const standalone = loadStandaloneShutdown()
  vi.mocked(resolveServerSession).mockResolvedValue({ token: 'held-token', expiresAt: null, refreshed: false, refreshFailed: false })
  let upstream!: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const fetchUpstream = vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { upstream = controller } })))
  vi.stubGlobal('fetch', fetchUpstream)
  const response = await POST(new NextRequest('https://example.invalid/api/chat/stream', {
    method: 'POST', headers: { 'x-orbit-held-account-id': 'account-a' }, body: new FormData(),
  }))
  const reader = response.body!.getReader()
  upstream.enqueue(encoder.encode('data: {"type":"started"}\n\n'))
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"started"')
  await standalone.exports.startServer({ dir: '.', port: 3000, isDev: false })
  expect(standalone.processEvents.listenerCount('SIGTERM')).toBe(1)
  standalone.processEvents.emit('SIGTERM', 'SIGTERM')
  standalone.processEvents.emit('SIGTERM', 'SIGTERM')
  expect(standalone.listener.close).toHaveBeenCalledTimes(1)
  expect(standalone.listener.closeAllConnections).not.toHaveBeenCalled()
  expect(standalone.closeRuntime).not.toHaveBeenCalled()
  expect(standalone.processEvents.exit).not.toHaveBeenCalled()
  const finalFrame = 'data: {"type":"final","response":{"aiMessage":"Done","actions":[]}}\n\n'
  upstream.enqueue(encoder.encode(finalFrame))
  upstream.close()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(finalFrame)
  expect((await reader.read()).done).toBe(true)
  standalone.finish()
  await vi.waitFor(() => expect(standalone.processEvents.exit).toHaveBeenCalledWith(143))
  expect(standalone.closeRuntime).toHaveBeenCalledTimes(1)
  expect(fetchUpstream).toHaveBeenCalledTimes(1)
})
