import { describe, expect, it, vi } from 'vitest'

import { OnboardingMeetAstra } from '@/components/onboarding/onboarding-meet-astra'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const TestRenderer = require('react-test-renderer')

describe('OnboardingMeetAstra (mobile)', () => {
  it('renders Astra avatar with an accessibility label', async () => {
    let tree: any
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingMeetAstra />)
    })
    expect(tree.root.findByProps({ accessibilityLabel: 'chat.astraAvatarLabel' })).toBeDefined()
  })

  it('renders the orbital mark for the hero and the bubble', async () => {
    let tree: any
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingMeetAstra />)
    })
    expect(tree.root.findAllByType('Svg').length).toBeGreaterThanOrEqual(2)
  })
})
