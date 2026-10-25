import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'

const modules = vi.hoisted(() => ({ release: vi.fn(), checkpoint: vi.fn() }))
vi.mock('@/lib/desktop-web-release', async importOriginal => {
  modules.release()
  return importOriginal()
})
vi.mock('@/lib/desktop-chat-checkpoint', async importOriginal => {
  modules.checkpoint()
  return importOriginal()
})
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@/components/service-worker-bridge', () => ({ ServiceWorkerBridge: () => null }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('imports release monitoring and checkpoints only after the provider discovers the shell', async () => {
  const { Providers } = await import('@/lib/providers')
  await import('@/app/(auth)/layout')
  await import('@/hooks/use-chat-composer')
  await import('@/components/chat/answer-block')
  const { holdAccount } = await import('@/__tests__/support/account-change')
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
  await act(async () => { render(application) })
  expect(await screen.findByText('Hoje')).toBeVisible()
  expect(modules.release).toHaveBeenCalledOnce()
  expect(modules.checkpoint).toHaveBeenCalledOnce()
  expect(fetchRelease).toHaveBeenCalledWith('/api/desktop-release', expect.objectContaining({ cache: 'no-store' }))
})
