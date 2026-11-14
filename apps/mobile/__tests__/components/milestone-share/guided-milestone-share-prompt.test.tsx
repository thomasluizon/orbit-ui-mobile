import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { SETTLE_DELAY_MS } from '@orbit/shared/utils'
import { testI18n } from '@/__tests__/support/i18n'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { MILESTONE_SHARE_CARD_WIDTH } from '@/components/milestone-share/milestone-share-card'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

const mocks = vi.hoisted(() => ({ hasError: false, share: vi.fn() }))

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ getQueryData: () => undefined }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({ shareRef: { current: null }, isSharing: false, hasError: mocks.hasError, share: mocks.share }),
}))

const LOCALES = [{ locale: 'pt-BR', copy: ptBR.milestoneShare }, { locale: 'en', copy: en.milestoneShare }] as const

let tree: ReactTestRenderer | null = null

/** Arms a streak milestone and waits the settle delay. */
async function openPrompt(locale: 'pt-BR' | 'en' = 'pt-BR') {
  await testI18n.changeLanguage(locale)
  await renderer.act(() => { tree = renderer.create(<MilestoneSharePrompt suppressed={false} />) })
  await renderer.act(async () => {
    useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7')
    await Promise.resolve()
  })
  await renderer.act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_DELAY_MS) })
  return tree!
}

const hosts = (root: ReactTestRenderer): ReactTestInstance[] => root.root.findAll((node) => typeof node.type === 'string')
const byTestId = (root: ReactTestRenderer, testID: string) => hosts(root).filter((node) => node.props.testID === testID)
const texts = (root: ReactTestRenderer) => hosts(root).filter((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children))
const feliz = (root: ReactTestRenderer) => byTestId(root, 'orbit-mascot').filter((node) => node.props['data-orbit-state'] === 'feliz')
const nameOf = (node: ReactTestInstance) => typeof node.props.accessibilityLabel === 'string'
  ? node.props.accessibilityLabel
  : node.findAll((child) => String(child.type) === 'Text').map((child) => renderedText(child.props.children)).join(' ')
const control = (root: ReactTestRenderer, name: string) => {
  const found = hosts(root).find((node) => String(node.type) === 'Pressable' && typeof node.props.onPress === 'function' && nameOf(node) === name)
  if (!found) throw new Error(`No control named ${name}`)
  return found
}
const press = (node: ReactTestInstance) => renderer.act(() => { (node.props.onPress as () => void)() })

beforeEach(() => {
  vi.useFakeTimers()
  mocks.hasError = false
  mocks.share.mockReset()
  useEngagementPromptStore.setState({ promptedMilestoneKeys: [], lastPromptedAtIso: null, homeEntryDismissed: false, armedPrompt: null })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
})

afterEach(async () => {
  await renderer.act(() => { tree?.unmount() })
  tree = null
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('the guided milestone share prompt on Android', () => {
  it.each(LOCALES)('opens a centred dialog named by its title, with Orbit in Feliz and its current actions in $locale', async ({ locale, copy }) => {
    enableTestFlags('orbit_guided_flows')
    const root = await openPrompt(locale)

    const dialog = byTestId(root, 'milestone-share-dialog')[0]!
    expect(dialog.props).toMatchObject({ role: 'dialog', accessibilityViewIsModal: true, accessibilityLabel: copy.title, accessibilityHint: copy.body })
    expect(byTestId(root, 'milestone-share-dialog-centre')[0]!.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ alignItems: 'center', justifyContent: 'center' })]))
    expect(hosts(root).some((node) => String(node.type) === 'Sheet')).toBe(false)
    expect(texts(root)).toEqual(expect.arrayContaining([copy.title, copy.body, copy.streakEyebrow]))
    expect(feliz(root)).toHaveLength(1)
    expect(feliz(root)[0]!.props).toMatchObject({ width: 96, 'data-orbit-face': 'rig' })

    const card = byTestId(root, 'milestone-share-card')[0]!
    const cardMarks = card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
    expect(cardMarks).toHaveLength(1)
    expect(cardMarks[0]!.props).toMatchObject({ 'data-orbit-face': 'small', 'data-orbit-loop': 'still' })

    await press(control(root, copy.share))
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ shareTitle: copy.shareTitle, shareText: copy.shareText }))

    await press(control(root, copy.later))
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(0)
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain('share-streak-7')
  })

  it('closes on a scrim press and on Android back', async () => {
    enableTestFlags('orbit_guided_flows')
    const root = await openPrompt()
    await press(byTestId(root, 'milestone-share-dialog-scrim')[0]!)
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(0)
    await renderer.act(() => { root.unmount() })

    useEngagementPromptStore.setState({ promptedMilestoneKeys: [], lastPromptedAtIso: null, homeEntryDismissed: false, armedPrompt: null })
    useUIStore.setState({ openOverlayIds: [] })
    const reopened = await openPrompt()
    const modal = hosts(reopened).find((node) => String(node.type) === 'Modal')!
    await renderer.act(() => { (modal.props.onRequestClose as () => void)() })
    expect(byTestId(reopened, 'milestone-share-dialog')).toHaveLength(0)
  })

  it('scales the card preview to the width of the dialog and keeps the logical width of the card', async () => {
    enableTestFlags('orbit_guided_flows')
    const root = await openPrompt()

    await renderer.act(() => { (byTestId(root, 'milestone-card-preview')[0]!.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 240, height: 0 } } }) })
    await renderer.act(() => { (byTestId(root, 'milestone-card-scale')[0]!.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: MILESTONE_SHARE_CARD_WIDTH, height: 300 } } }) })
    const scale = 240 / MILESTONE_SHARE_CARD_WIDTH
    expect(byTestId(root, 'milestone-card-scale')[0]!.props.style).toMatchObject({ width: MILESTONE_SHARE_CARD_WIDTH, transform: [{ scale }] })
    expect(byTestId(root, 'milestone-card-preview')[0]!.props.style).toEqual(expect.arrayContaining([{ height: 300 * scale }]))
  })

  it('shows the current message after a share that fails', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.hasError = true
    const root = await openPrompt()

    expect(hosts(root).some((node) => node.props.accessibilityRole === 'alert' && renderedText(node.props.children) === ptBR.milestoneShare.shareError)).toBe(true)
  })

  it('never opens while the celebration panel is open', async () => {
    enableTestFlags('orbit_guided_flows')
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    const root = await openPrompt()

    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(0)
    expect(feliz(root)).toHaveLength(0)
  })

  it('leaves the screen while a celebration shows over an open dialog, and returns after it', async () => {
    enableTestFlags('orbit_guided_flows')
    const root = await openPrompt()
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(1)

    await renderer.act(() => { useUIStore.getState().enqueueCelebration('streak', { streak: 30 }) })
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(0)
    expect(feliz(root)).toHaveLength(0)

    await renderer.act(() => { useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] }) })
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(1)
  })

  it('closes when the overlay layer suppresses the prompts', async () => {
    enableTestFlags('orbit_guided_flows')
    const root = await openPrompt()

    await renderer.act(() => { root.update(<MilestoneSharePrompt suppressed />) })
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(0)
  })

  it('renders the current sheet with the flag off: no centred dialog and no Orbit in Feliz', async () => {
    const root = await openPrompt()

    expect(hosts(root).find((node) => String(node.type) === 'Sheet')?.props.title).toBe(ptBR.milestoneShare.title)
    expect(byTestId(root, 'milestone-share-dialog')).toHaveLength(0)
    expect(feliz(root)).toHaveLength(0)
    expect(control(root, ptBR.milestoneShare.later)).toBeTruthy()
  })
})
