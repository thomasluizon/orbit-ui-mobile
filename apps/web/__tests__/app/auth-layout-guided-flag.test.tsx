import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import AuthLayout from '@/app/(auth)/layout'
import { useGuidedSignIn } from '@/components/auth/guided-sign-in'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const flag = vi.hoisted(() => ({ keys: [] as string[], guided: false }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: (key: string) => { flag.keys.push(key); return flag.guided } }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function Probe() {
  return <output aria-label="guided">{useGuidedSignIn() ? 'on' : 'off'}</output>
}

beforeEach(async () => {
  flag.keys.length = 0
  useOnboardingDraftStore.getState().markOnboardingLocallyDone()
  await useOnboardingDraftStore.persist.rehydrate()
})

it.each([[true, 'on', 'DIV'], [false, 'off', 'MAIN']] as const)('gives the sign-in routes the orbit_guided_flows read %s, and the frame holds the main landmark only for the current surface', async (guided, value, frame) => {
  flag.guided = guided
  const { container } = render(<AuthLayout><Probe /></AuthLayout>)
  await act(async () => {})
  expect(screen.getByLabelText('guided')).toHaveTextContent(value)
  expect(flag.keys).toContain('orbit_guided_flows')
  expect(new Set(flag.keys).size).toBe(1)
  expect(container.querySelector('[data-auth-page-frame]')!.tagName).toBe(frame)
})

it('reads off outside the sign-in routes', () => {
  render(<Probe />)
  expect(screen.getByLabelText('guided')).toHaveTextContent('off')
})
