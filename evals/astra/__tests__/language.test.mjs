import { afterEach, expect, it, vi } from 'vitest'
import { withLegacyProfileLanguage } from '../fixtures/language.mjs'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it.each(['success', 'chat-error', 'target-readback', 'restore-readback', 'write-error', 'unknown-original'])(
  'verifies profile restoration and makes unusable locale evidence unavailable: %s', async (mode) => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-access')
    let language = mode === 'unknown-original' ? null : 'en'
    let reads = 0
    const writes = []
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      if (path === '/api/profile/language') {
        language = JSON.parse(options.body).language
        writes.push(language)
        return new Response(null, { status: mode === 'write-error' && writes.length === 1 ? 503 : 204 })
      }
      if (path !== '/api/profile') throw new Error('Unexpected request.')
      reads++
      return Response.json({ language: mode === 'target-readback' && reads === 2 ? 'en'
        : mode === 'restore-readback' && reads === 3 ? 'pt-BR' : language })
    })
    const run = vi.fn(async () => {
      expect(language).toBe('pt-BR')
      if (mode === 'chat-error') throw new Error('Chat transport failed.')
      return { output: 'Portuguese fallback.' }
    })
    const result = await withLegacyProfileLanguage({ credentialKey: 'ORBIT_EVAL_TOKEN', legacyProfileLanguage: 'pt-BR' }, run)
    expect(writes).toEqual(mode === 'unknown-original' ? [] : ['pt-BR', 'en'])
    expect(reads).toBe(mode === 'unknown-original' ? 1 : mode === 'write-error' ? 2 : 3)
    if (mode === 'success') expect(result).toEqual({ output: 'Portuguese fallback.' })
    else expect(result.metadata.astraPreconditionFailure).toBe(true)
    expect(run).toHaveBeenCalledTimes(['target-readback', 'write-error', 'unknown-original'].includes(mode) ? 0 : 1)
  },
)
