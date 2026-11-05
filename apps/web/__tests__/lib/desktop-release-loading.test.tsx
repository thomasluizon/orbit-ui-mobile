import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { Providers } from '@/lib/providers'
import '@/app/(auth)/layout'
import '@/hooks/use-chat-composer'
import '@/components/chat/answer-block'
import { holdAccount } from '@/__tests__/support/account-change'
import { waitForLazyContent } from '@/__tests__/support/lazy-content'

const modules = vi.hoisted(() => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const ready = new Promise<void>((complete, fail) => { resolve = complete; reject = fail })
  return { release: vi.fn(), checkpoint: vi.fn(), ready, resolve, reject }
})
vi.mock('@/lib/desktop-web-release', async importOriginal => {
  modules.release()
  const loading = importOriginal()
  void loading.then(modules.resolve, modules.reject)
  return loading
})
vi.mock('@/lib/desktop-chat-checkpoint', async importOriginal => {
  modules.checkpoint()
  return importOriginal()
})
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@/components/service-worker-bridge', () => ({ ServiceWorkerBridge: () => null }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('imports release monitoring and checkpoints only after the provider discovers the shell', async () => {
  holdAccount('desktop-account')
  const fetchRelease = vi.fn(async () => Response.json({ commit: null, minimumShellVersion: '0.0.0' }))
  vi.stubGlobal('fetch', fetchRelease)
  const application = <NextIntlClientProvider locale="en" messages={en}><Providers><p>Hoje</p></Providers></NextIntlClientProvider>
  const browser = render(application)
  expect(screen.getByText('Hoje')).toBeVisible()
  expect(modules.release).not.toHaveBeenCalled()
  expect(modules.checkpoint).not.toHaveBeenCalled()
  expect(fetchRelease).not.toHaveBeenCalled()
  browser.unmount()

  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.2')
  render(application)
  await waitForLazyContent(modules.ready)
  expect(await screen.findByText('Hoje')).toBeVisible()
  await waitFor(() => expect(fetchRelease).toHaveBeenCalledWith('/api/desktop-release', expect.objectContaining({ cache: 'no-store' })))
  expect(modules.release).toHaveBeenCalledOnce()
  expect(modules.checkpoint).toHaveBeenCalledOnce()
})
