import { describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'

vi.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => true,
}))

describe('TrialExpiredModal (mobile)', () => {
  it('renders paused Pro features without a color-scheme benefit', async () => {
    let tree: import('react-test-renderer').ReactTestRenderer | undefined

    await act(async () => {
      tree = create(<TrialExpiredModal />)
      await Promise.resolve()
    })

    const renderedText = tree?.root
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => node.props.children)

    expect(renderedText).toContain('trial.expired.aiChat')
    expect(renderedText).toContain('trial.expired.aiSummary')
    expect(renderedText).not.toContain('trial.expired.allColors')
  })
})
