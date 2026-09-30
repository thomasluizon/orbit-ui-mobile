import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReferralStats } from '@orbit/shared/types/referral'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const TestRenderer = require('react-test-renderer')

const stats: ReferralStats = {
  referralCode: 'ORBIT1',
  referralLink: 'https://useorbit.org/r/ORBIT1',
  successfulReferrals: 1,
  pendingReferrals: 0,
  maxReferrals: 5,
  rewardType: 'discount',
  discountPercent: 20,
}

const mocks = vi.hoisted(() => ({
  referral: {} as { stats: ReferralStats | null; isLoading: boolean; isError: boolean; error: Error | null },
  share: vi.fn(),
  setString: vi.fn(),
}))

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Share: { share: mocks.share },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: mocks.setString } }))
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({ ...mocks.referral, referralUrl: 'https://useorbit.org/r/ORBIT1' }),
}))

function renderDrawer() {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ReferralDrawer open onClose={vi.fn()} />)
  })
  return tree
}

function slot(tree: any, name: 'SheetBody' | 'SheetActions') {
  return tree.root.findAll((node: any) => node.type === name)[0]
}

async function pressButton(container: any, label: string) {
  const button = container.findAll((node: any) =>
    typeof node.type === 'string' && node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function'
    && (node.props.accessibilityLabel === label || node.findAll((child: any) => child.props.children === label).length > 0))[0]
  await TestRenderer.act(async () => {
    button.props.onPress()
    await Promise.resolve()
  })
}

function alerts(container: any): string[] {
  return container
    .findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert')
    .map((node: any) => node.props.children)
}

describe('ReferralDrawer (mobile)', () => {
  beforeEach(() => {
    mocks.referral = { stats, isLoading: false, isError: false, error: null }
    mocks.share.mockReset().mockResolvedValue({ action: 'sharedAction' })
    mocks.setString.mockReset()
  })

  it('shows a failed share in the pinned footer, beside Share', async () => {
    mocks.share.mockRejectedValueOnce(new Error('share failed'))
    const tree = renderDrawer()

    await pressButton(slot(tree, 'SheetActions'), 'referral.drawer.share')

    expect(alerts(slot(tree, 'SheetActions'))).toEqual(['referral.drawer.actionFailed'])
    expect(alerts(slot(tree, 'SheetBody'))).toEqual([])
  })

  it('shows a failed copy in the body, beside the link', async () => {
    mocks.setString.mockImplementationOnce(() => {
      throw new Error('denied')
    })
    const tree = renderDrawer()

    await pressButton(slot(tree, 'SheetBody'), 'referral.drawer.copyLink')

    expect(alerts(slot(tree, 'SheetBody'))).toEqual(['referral.drawer.actionFailed'])
    expect(alerts(slot(tree, 'SheetActions'))).toEqual([])
  })

  it('pins Share in the sheet footer and keeps only the copy control in the body', () => {
    const tree = renderDrawer()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['referral.drawer.share'])
    expect(sheetActionsUseActionPair(tree.root)).toBe(true)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual(['referral.drawer.copyLink'])
  })

  it.each([
    ['loading', { stats: null, isLoading: true, isError: false, error: null }],
    ['failed', { stats: null, isLoading: false, isError: true, error: new Error('unavailable') }],
  ] as const)('offers no Share while the referral is %s', (_state, referral) => {
    mocks.referral = { ...referral }
    const tree = renderDrawer()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual([])
  })
})
