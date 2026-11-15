import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'
import { NotificationList } from '@/components/navigation/notification-list'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/input', () => ({ Input: (props: Record<string, unknown>) => React.createElement('Input', props) }))

function stateMascotSizes(tree: ReactTestRenderer) {
  return tree.root.findAllByType(OrbitMascot).map((face) => face.props.size as number)
}

async function renderAt(width: number, element: React.ReactElement) {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: ReactTestRenderer
  await act(() => { tree = create(element) })
  return tree
}

afterEach(() => { __resetTestHostConfig() })

describe('state surface Orbit size', () => {
  it.each([[1023, 96], [1024, 128]] as const)('draws the onboarding welcome Orbit at %ipx as %i', async (width, size) => {
    const tree = await renderAt(width, <OnboardingWelcome sentence="" marks={[]} onChange={vi.fn()} />)
    expect(stateMascotSizes(tree)).toEqual([size])
  })

  it.each([[1023, 96], [1024, 128]] as const)('draws the empty notification list Orbit at %ipx as %i', async (width, size) => {
    const tree = await renderAt(width, (
      <NotificationList items={[]} isLoading={false} isError={false} onRetry={vi.fn()} onOpen={vi.fn()} onDelete={vi.fn()} />
    ))
    expect(stateMascotSizes(tree)).toEqual([size])
  })
})
