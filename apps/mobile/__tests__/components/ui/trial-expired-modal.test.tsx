import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const push = vi.hoisted(() => vi.fn())

vi.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => true,
}))

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'),
)

describe('TrialExpiredModal (mobile)', () => {
  afterEach(() => {
    sheetTestControls.defer(false)
  })

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

  it('routes to upgrade only after the sheet dismisses', async () => {
    sheetTestControls.defer(true)
    let tree: import('react-test-renderer').ReactTestRenderer | undefined

    await act(async () => {
      tree = create(<TrialExpiredModal />)
      await Promise.resolve()
    })

    const subscribe = tree?.root.findAll(
      (node) => String(node.type) === 'Pressable' && node.findAll(
        (child) => String(child.type) === 'Text' && child.props.children === 'trial.expired.subscribe',
      ).length > 0,
    )[0]
    if (!subscribe) throw new Error('Subscribe action not found')

    await act(() => (subscribe.props as { onPress: () => void }).onPress())

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(push).not.toHaveBeenCalled()

    await act(() => sheetTestControls.completeDismissal())

    expect(push).toHaveBeenCalledWith({
      pathname: '/upgrade',
      params: { from: '/' },
    })
    expect(push).toHaveBeenCalledTimes(1)
  })
})
