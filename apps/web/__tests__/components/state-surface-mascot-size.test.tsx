import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'
import { NotificationList } from '@/components/navigation/notification-list'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function stubViewportWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? Infinity),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function stateMascotWidths(container: HTMLElement) {
  return [...container.querySelectorAll('svg[data-asset="orbit-mascot"][data-orbit-face="rig"]')].map((face) => face.getAttribute('width'))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('state surface Orbit size', () => {
  it.each([[1023, '96'], [1024, '128']] as const)('draws the onboarding welcome Orbit at %ipx as %s', (width, size) => {
    stubViewportWidth(width)
    const { container } = render(<OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} />)
    expect(stateMascotWidths(container)).toEqual([size])
  })

  it.each([[1023, '96'], [1024, '128']] as const)('draws the empty notification list Orbit at %ipx as %s', (width, size) => {
    stubViewportWidth(width)
    const { container } = render(
      <NotificationList items={[]} isLoading={false} isError={false} onRetry={vi.fn()} onOpen={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(stateMascotWidths(container)).toEqual([size])
  })
})
