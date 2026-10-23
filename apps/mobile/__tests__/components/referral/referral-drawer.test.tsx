import { referralCopyCases } from '@orbit/shared/__tests__/referral-copy-fixtures'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReferralStats } from '@orbit/shared/types/referral'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { renderedText } from '../../support/react-test-renderer'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { expectSmallSheetActions, sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

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
  locale: '',
  referral: {} as { stats: (Omit<ReferralStats, 'rewardType'> & { rewardType?: string }) | null; isLoading: boolean; isError: boolean; error: Error | null },
  share: vi.fn(),
  setStringAsync: vi.fn().mockResolvedValue(true),
}))

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Share: { share: mocks.share },
}))

const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({ resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, lng: 'en', fallbackLng: 'en', initAsync: false })
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => mocks.locale ? testI18n.getFixedT(mocks.locale)(key, params) : key }) }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setStringAsync }))
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
    mocks.locale = ''
    mocks.referral = { stats, isLoading: false, isError: false, error: null }
    mocks.share.mockReset().mockResolvedValue({ action: 'sharedAction' })
    mocks.setStringAsync.mockReset()
  })

  it.each(['en', 'pt-BR'])('describes the real Pro-days offer and shares it in %s', async (locale) => {
    mocks.locale = locale
    mocks.referral.stats = { ...stats, successfulReferrals: 8, rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }
    const tree = renderDrawer()
    const output = renderedText(tree.toJSON())
    expect(output).toContain(locale === 'en'
      ? 'Invite someone to create an account with your link. If they log habits on three different days in their first week, you can earn 7 days of Pro.'
      : 'Convide alguém a criar uma conta pelo seu link. Se a pessoa registrar hábitos em três dias diferentes na primeira semana, você pode ganhar 7 dias de Pro.')
    expect(output).not.toMatch(/23%|Coupons earned|Cupons ganhos|56/)
    await pressButton(slot(tree, 'SheetActions'), testI18n.getFixedT(locale)('referral.drawer.share'))
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(locale === 'en' ? 'I can earn 7 days of Pro.' : 'Eu posso ganhar 7 dias de Pro.') }))
  })

  it('shows a failed share in the pinned footer, beside Share', async () => {
    mocks.share.mockRejectedValueOnce(new Error('share failed'))
    const tree = renderDrawer()

    await pressButton(slot(tree, 'SheetActions'), 'referral.drawer.share')

    expect(alerts(slot(tree, 'SheetActions'))).toEqual(['referral.drawer.actionFailed'])
    expect(alerts(slot(tree, 'SheetBody'))).toEqual([])
  })

  it('shows a failed copy in the body, beside the link', async () => {
    mocks.setStringAsync.mockImplementationOnce(() => {
      throw new Error('denied')
    })
    const tree = renderDrawer()

    await pressButton(slot(tree, 'SheetBody'), 'referral.drawer.copyLink')

    expect(alerts(slot(tree, 'SheetBody'))).toEqual(['referral.drawer.actionFailed'])
    expect(alerts(slot(tree, 'SheetActions'))).toEqual([])
  })

  it('pins Share in the sheet footer and keeps only the copy control in the body', () => {
    const tree = renderDrawer()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'referral.drawer.share'])
    expectSmallSheetActions(tree.root)
    expect(sheetActionsUseActionPair(tree.root)).toBe(true)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual(['referral.drawer.copyLink'])
  })

  it('cancels through the sheet host without sharing', async () => {
    const onClose = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ReferralDrawer open onClose={onClose} />) })
    await pressButton(slot(tree, 'SheetActions'), 'common.cancel')
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.share).not.toHaveBeenCalled()
  })

  it.each([
    ['loading', { stats: null, isLoading: true, isError: false, error: null }],
    ['failed', { stats: null, isLoading: false, isError: true, error: new Error('unavailable') }],
  ] as const)('offers no Share while the referral is %s', (_state, referral) => {
    mocks.referral = { ...referral }
    const tree = renderDrawer()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual([])
  })
  it.each(referralCopyCases)('shows exact $locale reward prose and shares its matching offer', async ({ locale, stats: rewardStats, invitation, explanation }) => {
    mocks.locale = locale
    mocks.referral.stats = { ...stats, successfulReferrals: 8, ...rewardStats }
    const tree = renderDrawer()
    expect(renderedText(tree.toJSON())).toContain(explanation)
    expect(renderedText(tree.toJSON())).toContain((locale === 'en' ? en : ptBR).referral.reward.eligibility)
    await pressButton(slot(tree, 'SheetActions'), (locale === 'en' ? en : ptBR).referral.drawer.share)
    expect(mocks.share).toHaveBeenLastCalledWith({ title: (locale === 'en' ? en : ptBR).referral.share.title, message: `${invitation} https://useorbit.org/r/ORBIT1` })
  })

  it.each([undefined, 'future_reward', 'pro_days'])('keeps a loaded unknown or incomplete reward nonnumeric, kind %s', async (rewardType) => {
    mocks.locale = 'en'
    mocks.referral.stats = { ...stats, rewardType, discountPercent: 23 }
    const tree = renderDrawer()
    expect(renderedText(tree.toJSON())).toContain('Share your link to invite someone to Orbit.')
    expect(renderedText(tree.toJSON())).not.toMatch(/23%|Coupons earned/)
    await pressButton(slot(tree, 'SheetActions'), en.referral.drawer.share)
    expect(mocks.share).toHaveBeenLastCalledWith({ title: en.referral.share.title, message: 'Join me on Orbit. https://useorbit.org/r/ORBIT1' })
  })

})
