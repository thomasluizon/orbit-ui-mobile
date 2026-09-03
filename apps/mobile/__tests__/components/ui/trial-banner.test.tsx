import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import { TrialBanner } from '@/components/ui/trial-banner'

let profile = { isTrialActive: true, hasProAccess: true }
let daysLeft = 5

vi.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile }),
  useTrialDaysLeft: () => daysLeft,
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

function renderedText(tree: import('react-test-renderer').ReactTestRenderer) {
  return tree.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => JSON.stringify(node.props.children))
    .join(' ')
}

async function renderBanner() {
  let tree: import('react-test-renderer').ReactTestRenderer | undefined
  await act(async () => {
    tree = create(<TrialBanner />)
    await Promise.resolve()
  })
  if (!tree) throw new Error('Trial banner did not render')
  return tree
}

describe('TrialBanner (mobile)', () => {
  beforeEach(() => {
    profile = { isTrialActive: true, hasProAccess: true }
    daysLeft = 5
  })

  it('renders the plural day-count variant', async () => {
    const tree = await renderBanner()
    expect(renderedText(tree)).toContain('trial.banner.daysLeft')
  })

  it('uses the dedicated last-day string when 0 days are left', async () => {
    daysLeft = 0
    const tree = await renderBanner()
    expect(renderedText(tree)).toContain('trial.banner.lastDay')
    expect(renderedText(tree)).not.toContain('trial.banner.daysLeft')
  })

  it('uses the singular day-count variant when 1 day is left', async () => {
    daysLeft = 1
    const tree = await renderBanner()
    expect(renderedText(tree)).toContain('trial.banner.daysLeft')
    expect(renderedText(tree)).not.toContain('trial.banner.lastDay')
  })

  it('renders the free-plan variant outside a trial', async () => {
    profile = { isTrialActive: false, hasProAccess: false }
    const tree = await renderBanner()
    expect(renderedText(tree)).toContain('trial.banner.freeLine')
  })

  it('renders a quiet, non-dismissible line', async () => {
    const tree = await renderBanner()
    const banner = tree.root.findAll((node) => node.props.testID === 'trial-banner')[0]!
    const subscribe = tree.root.findAll((node) => node.props.accessibilityRole === 'button')[0]!
    const subscribeStyleProp = subscribe.props.style
    if (typeof subscribeStyleProp !== 'function') throw new Error('Subscribe style is not resolved')
    const subscribeStyle = StyleSheet.flatten(subscribeStyleProp({ pressed: false }))
    expect(banner.props.style).toEqual(expect.objectContaining({ minHeight: 24 }))
    expect(subscribeStyle).toEqual(expect.objectContaining({ minHeight: 44, minWidth: 44 }))
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'common.dismiss')).toHaveLength(0)
  })
})
