import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  TEMPLATE_PACKS,
  templatePackHabitTitleKey,
  templatePackNameKey,
  templatePackTagKey,
} from '@orbit/shared/utils'

import { OnboardingTemplatePacks } from '@/components/onboarding/onboarding-template-packs'
import { PillButton } from '@/components/ui/pill-button'

const TestRenderer = require('react-test-renderer')

const createHabitsBulk = vi.fn<
  (items: Array<{ title: string; emoji?: string | null; tags?: string[] | null }>) => Promise<void>
>(async () => {})
const onCreated = vi.fn()
const onCreateOwn = vi.fn()
const onSkip = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => ({
      bgCard: '#111',
      hairline: '#222',
      hairlineStrong: '#333',
      primary: '#7f46f7',
      primarySoft: '#a07cff',
      fgOnPrimary: '#fff',
      fg1: '#fff',
      fg2: '#ccc',
      fg3: '#999',
      fg4: '#666',
    }),
    tintFromPrimary: () => 'rgba(127,70,247,0.15)',
  }
})

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({ createHabitsBulk }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

function renderPicker() {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <OnboardingTemplatePacks onCreated={onCreated} onCreateOwn={onCreateOwn} onSkip={onSkip} />,
    )
  })
  return tree
}

function pressByLabel(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  const node = tree.root.findAll(
    (candidate: { props?: Record<string, unknown>; type: unknown }) =>
      candidate.props?.accessibilityLabel === label &&
      typeof candidate.props.onPress === 'function' &&
      typeof candidate.type !== 'string',
  )[0]
  TestRenderer.act(() => {
    ;(node.props.onPress as () => void)()
  })
}

describe('OnboardingTemplatePacks (mobile)', () => {
  beforeEach(() => {
    createHabitsBulk.mockClear()
    onCreated.mockClear()
    onCreateOwn.mockClear()
    onSkip.mockClear()
  })

  it('lists all four packs', () => {
    const tree = renderPicker()
    for (const pack of TEMPLATE_PACKS) {
      const rows = tree.root.findAll(
        (candidate: { props?: Record<string, unknown> }) =>
          candidate.props?.accessibilityLabel === templatePackNameKey(pack.id),
      )
      expect(rows.length).toBeGreaterThan(0)
    }
  })

  it('invokes onCreateOwn from the pack grid', () => {
    const tree = renderPicker()
    pressByLabel(tree, 'onboarding.flow.templatePacks.createOwn')
    expect(onCreateOwn).toHaveBeenCalledTimes(1)
  })

  it('selects a pack, drops a toggled-off habit, and bulk-creates the rest with tags', async () => {
    const pack = TEMPLATE_PACKS[0]
    if (!pack) throw new Error('expected a template pack')
    const firstHabit = pack.habits[0]
    const secondHabit = pack.habits[1]
    if (!firstHabit || !secondHabit) throw new Error('expected pack habits')

    const tree = renderPicker()
    pressByLabel(tree, templatePackNameKey(pack.id))
    pressByLabel(tree, templatePackHabitTitleKey(pack.id, firstHabit.key))

    const cta = tree.root.findByType(PillButton)
    await TestRenderer.act(async () => {
      await (cta.props.onPress as () => Promise<void>)()
    })

    expect(createHabitsBulk).toHaveBeenCalledTimes(1)
    const items = createHabitsBulk.mock.calls[0]![0]
    expect(items).toHaveLength(pack.habits.length - 1)

    const titles = items.map((item) => item.title)
    expect(titles).not.toContain(
      templatePackHabitTitleKey(pack.id, firstHabit.key),
    )

    const secondItem = items.find(
      (item) => item.title === templatePackHabitTitleKey(pack.id, secondHabit.key),
    )
    expect(secondItem?.emoji).toBe(secondHabit.emoji)
    expect(secondItem?.tags).toEqual(
      secondHabit.tags.map((slug) => templatePackTagKey(slug)),
    )

    expect(onCreated).toHaveBeenCalledTimes(1)
  })
})
