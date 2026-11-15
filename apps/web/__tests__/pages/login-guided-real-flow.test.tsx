import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { AuthPageFrame } from '@/components/auth/auth-page-frame'
import { GuidedSignInContext } from '@/components/auth/guided-sign-in'

const mocks = vi.hoisted(() => ({ online: true, push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.push }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

const copy = ptBR.auth
const requests = vi.fn()

function show() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <GuidedSignInContext value><AuthPageFrame><LoginContent /></AuthPageFrame></GuidedSignInContext>
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  mocks.online = true
  requests.mockReset().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', requests)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('shows the address hint beside the field and focuses it on an empty submit, and sends nothing', async () => {
  show()
  const field = screen.getByRole('textbox', { name: copy.email })
  fireEvent.click(screen.getByRole('button', { name: copy.sendCode }))
  await waitFor(() => expect(field).toHaveFocus())
  expect(field).toHaveAccessibleDescription(copy.errors.invalidEmail)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.email)
  expect(requests).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'ada@example.com' } })
  expect(field).not.toHaveAttribute('aria-invalid')
})

it('sends one code request for a double press and opens the code question with the address kept on the way back', async () => {
  show()
  fireEvent.change(screen.getByRole('textbox', { name: copy.email }), { target: { value: 'ada@example.com' } })
  const action = screen.getByRole('button', { name: copy.sendCode })
  fireEvent.click(action)
  fireEvent.click(action)
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.verificationCode))
  expect(requests).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription(copy.line.codeSent.replace('{email}', 'ada@example.com'))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  fireEvent.click(screen.getByRole('button', { name: copy.changeEmail }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.email))
  expect(screen.getByRole('textbox', { name: copy.email })).toHaveValue('ada@example.com')
})

it('sends nothing while the device is offline and shows the reason', () => {
  mocks.online = false
  const { container } = show()
  fireEvent.change(screen.getByRole('textbox', { name: copy.email }), { target: { value: 'ada@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: copy.sendCode }))
  expect(requests).not.toHaveBeenCalled()
  expect(container.querySelector('[data-offline-notice]')).toHaveTextContent(copy.errors.offline)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.email)
})
