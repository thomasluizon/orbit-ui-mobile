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

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'),
)

describe('TrialExpiredModal (mobile)', () => {
  it('renders only the current paused Pro features', async () => {
    let tree: import('react-test-renderer').ReactTestRenderer | undefined

    await act(async () => {
      tree = create(<TrialExpiredModal />)
      await Promise.resolve()
    })

    const renderedText = tree?.root
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => node.props.children)

    expect(renderedText).toContain('trial.expired.astraCeiling')
    expect(renderedText).toContain('trial.expired.calendarSync')
    expect(renderedText).toContain('trial.expired.retrospective')
    expect(renderedText).toContain('trial.expired.proactiveAstra')
    expect(renderedText).not.toContain('trial.expired.savings')
    expect(renderedText).not.toContain('trial.expired.subHabits')
    expect(renderedText).not.toContain('trial.expired.goals')
  })
})
