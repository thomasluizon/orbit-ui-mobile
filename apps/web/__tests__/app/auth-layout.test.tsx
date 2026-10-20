import { useLayoutEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import AuthLayout from '@/app/(auth)/layout'
import { apiFetch } from '@/lib/api-fetch'
import { runServerAction } from '@/lib/client-action'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useVersionGateStore } from '@/stores/version-gate-store'

vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function CaptureAuthMount({ onMount }: Readonly<{ onMount: (region: HTMLElement) => void }>) {
  useLayoutEffect(() => { onMount(screen.getByRole('status')) }, [onMount])
  return <AuthLayout><div data-testid="sign-in-column"><input aria-label="Email" /></div></AuthLayout>
}

describe('AuthLayout reload guidance', () => {
  beforeEach(async () => {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    await useOnboardingDraftStore.persist.rehydrate()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    useUIStore.setState({ openOverlayIds: [] })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    vi.unstubAllGlobals()
  })

  it.each([false, true])('keeps the empty live region outside the centered flow with an existing notice: %s', async (existingNotice) => {
    if (existingNotice) useVersionGateStore.getState().requireReload('appUpdated')
    const onMount = vi.fn((region: HTMLElement) => {
      expect(region).toBeEmptyDOMElement()
      expect(region.closest('main')).toBeNull()
    })
    const { container } = render(<CaptureAuthMount onMount={onMount} />)
    expect(onMount).toHaveBeenCalledTimes(1)
    await act(async () => {})
    expect(container.querySelector('main > div')).toBe(screen.getByTestId('sign-in-column'))
    if (existingNotice) expect(screen.getByRole('status')).toHaveTextContent('errors.api.appUpdated')
    else expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it.each(['stale action', '426 response'] as const)('keeps one stable notice outside the sign-in flow after a %s', async (failure) => {
    const { container } = render(<AuthLayout><div data-testid="sign-in-column"><input aria-label="Email" /></div></AuthLayout>)
    await act(async () => {})
    const region = screen.getByRole('status')
    const column = screen.getByTestId('sign-in-column')
    const input = screen.getByRole('textbox', { name: 'Email' })
    input.focus()
    expect(region).toBeEmptyDOMElement()

    await act(async () => {
      if (failure === 'stale action') {
        void runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action')))
      } else {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 426 })))
        await expect(apiFetch('/api/auth/send-code')).rejects.toMatchObject({ status: 426 })
      }
    })

    expect(screen.getByRole('status')).toBe(region)
    expect(region.closest('main')).toBeNull()
    expect(container.querySelector('main > div')).toBe(column)
    expect(input).toHaveFocus()
    expect(container.querySelectorAll('[data-update-banner]')).toHaveLength(1)
    expect(region).toHaveTextContent(failure === 'stale action' ? 'errors.api.appUpdated' : 'forceUpdate.banner')
    expect(screen.getByRole('button', { name: failure === 'stale action' ? 'errors.api.reload' : 'forceUpdate.refresh' })).toBeEnabled()
  })
})
