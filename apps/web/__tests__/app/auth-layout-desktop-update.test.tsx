import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import AuthLayout from '@/app/(auth)/layout'
import { fetchAuthEndpoint } from '@/app/(auth)/login/login-form-helpers'
import { GET } from '@/app/api/desktop-release/route'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useDesktopUpdateStore } from '@/stores/desktop-update-store'
import { getHeldAccountId } from '@/stores/auth-store'
import { resetAuthStore } from '@/__tests__/support/account-change'
import { installWebLocks } from '@/__tests__/helpers/web-locks'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/login', useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const reload = vi.fn()
const native = {
  phase: 'downloaded', shellVersion: '0.1.27' as string | null, webCommit: null as string | null,
  deferred: false, restartRequested: false, checking: false, checkFailed: false, promptPending: false,
}
async function operateNative(command: string, payload: Record<string, unknown>) {
  if (command !== 'desktop_update') return true
  if (payload.action === 'cancel') native.restartRequested = false
  if (payload.action === 'download') native.phase = 'downloaded'
  if (payload.action === 'install') native.phase = 'installing'
  return { ...native }
}
const invoke = vi.fn(operateNative)
function actions() { return invoke.mock.calls.filter(([command]) => command === 'desktop_update').map(([, payload]) => payload.action) }
async function tick(milliseconds = 2000) {
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

beforeAll(async () => { await import('@/components/desktop-release-shell') })

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn())
  await resetAuthStore()
  localStorage.clear()
  sessionStorage.clear()
  useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
  useOnboardingDraftStore.getState().markOnboardingLocallyDone()
  await useOnboardingDraftStore.persist.rehydrate()
  useDesktopUpdateStore.setState({ notice: null, restart: null, later: null })
  Object.assign(native, { phase: 'downloaded', shellVersion: '0.1.27', restartRequested: false, promptPending: false })
  invoke.mockReset().mockImplementation(operateNative)
  reload.mockClear()
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => GET()))
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', '0.1.26')
  vi.stubGlobal('__ORBIT_DESKTOP_UPDATES__', true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function EmailStep() {
  return <form aria-label="Sign in"><input aria-label="Email" name="email" type="email" defaultValue="ada@example.com" /></form>
}

it('installs a shell update the person restarts from the native menu on the signed-out sign-in form', async () => {
  render(<AuthLayout><EmailStep /></AuthLayout>)
  await tick()
  expect(getHeldAccountId()).toBeNull()
  screen.getByRole('textbox', { name: 'Email' }).focus()
  await tick()
  expect(useDesktopUpdateStore.getState().notice).toEqual({ kind: 'shell', phase: 'available' })
  native.restartRequested = true
  await tick()
  expect(actions()).toContain('cancel')
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
  expect(reload).not.toHaveBeenCalled()
})

it('still waits for a form outside the sign-in surface before installing', async () => {
  render(<AuthLayout><EmailStep /></AuthLayout>)
  await tick()
  const unsaved = document.createElement('form')
  document.body.append(unsaved)
  native.restartRequested = true
  await tick()
  expect(actions()).toContain('cancel')
  expect(actions()).not.toContain('install')
  unsaved.remove()
  await tick()
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
})

it.each(['/api/auth/send-code', '/api/auth/verify-code'])('holds a requested restart while %s is in flight and installs after it settles', async endpoint => {
  installWebLocks()
  onTestFinished(() => { Reflect.deleteProperty(navigator, 'locks') })
  let settle: (response: Response) => void = () => {}
  vi.stubGlobal('fetch', vi.fn(async (input: string) => input === endpoint
    ? new Promise<Response>(resolve => { settle = resolve })
    : GET()))
  render(<AuthLayout><EmailStep /></AuthLayout>)
  await tick()
  const request = fetchAuthEndpoint(endpoint, { email: 'ada@example.com', code: '123456', language: 'en' })
  native.restartRequested = true
  await tick()
  expect(actions()).toContain('cancel')
  expect(actions()).not.toContain('install')
  settle(Response.json({}, { status: 200 }))
  await act(async () => { await request })
  native.restartRequested = true
  await tick()
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
})

it.each(['0.1.24', '0.1.25'])('replaces sign-in with the update path on a %s shell without the Turnstile frame fix', async version => {
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', version)
  render(<AuthLayout><EmailStep /></AuthLayout>)
  await tick()
  expect(screen.getByRole('alert')).toHaveTextContent('desktopUpdate.signInRequired')
  expect(screen.queryByRole('form', { name: 'Sign in' })).toBeNull()
  expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull()
  expect(useDesktopUpdateStore.getState().notice).toEqual({ kind: 'shell', phase: 'available' })
  native.restartRequested = true
  await tick()
  expect(actions().filter(action => action === 'install')).toHaveLength(1)
})

it.each(['0.1.26', '0.2.0'])('keeps sign-in on a %s shell with the Turnstile frame fix', async version => {
  vi.stubGlobal('__ORBIT_DESKTOP_VERSION__', version)
  render(<AuthLayout><EmailStep /></AuthLayout>)
  await tick()
  expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible()
  expect(screen.queryByText('desktopUpdate.signInRequired')).toBeNull()
})

it('keeps sign-in in a browser outside the desktop shell', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', undefined)
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  render(<AuthLayout><EmailStep /></AuthLayout>)
  await tick()
  expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible()
})
