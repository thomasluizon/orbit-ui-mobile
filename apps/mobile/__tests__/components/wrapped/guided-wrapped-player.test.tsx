import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockProfile, createMockRecap } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { testI18n } from '@/__tests__/support/i18n'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'
import { createTokensV2 } from '@/lib/theme'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

const mocks = vi.hoisted(() => ({ reducedMotion: false, share: vi.fn(), download: vi.fn() }))

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ weekStartDay: 1 }), isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => ({ stats: { rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }, isError: false }) }))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({ shareRef: { current: null }, isSharing: false, hasError: false, savedFileName: null, canShareFiles: true, share: mocks.share, download: mocks.download }),
}))
vi.mock('@/hooks/use-wrapped', () => ({
  useWrappedStory: (count: number) => {
    const [index, setIndex] = React.useState(0)
    return {
      index,
      isFirst: index === 0,
      isLast: index === count - 1,
      next: () => setIndex((current) => Math.min(current + 1, count - 1)),
      prev: () => setIndex((current) => Math.max(current - 1, 0)),
    }
  },
}))
vi.mock('react-native-gesture-handler', () => {
  const GestureDetector = ({ children }: Readonly<{ children?: React.ReactNode }>) => children
  function Pan() {
    const gesture = { activeOffsetY: () => gesture, failOffsetY: () => gesture, onEnd: () => gesture }
    return gesture
  }
  return { Gesture: { Pan }, GestureDetector }
})

const SLIDE_KINDS = ['intro', 'completions', 'activeDays', 'consistency', 'streak', 'topHabit', 'goals', 'share'] as const
const LOCALES = [{ locale: 'pt-BR', catalog: ptBR }, { locale: 'en', catalog: en }] as const
const recap = createMockRecap()
const slides = buildWrappedSlides(recap)
const tokens = createTokensV2('orange', 'dark')

let tree: ReactTestRenderer | null = null

async function renderPlayer(locale: 'pt-BR' | 'en' = 'pt-BR') {
  await testI18n.changeLanguage(locale)
  await renderer.act(() => {
    tree = renderer.create(<WrappedPlayer slides={slides} recap={recap} period="week" tokens={tokens} onClose={vi.fn()} />)
  })
  return tree!
}

const hosts = (root: ReactTestRenderer): ReactTestInstance[] => root.root.findAll((node) => typeof node.type === 'string')
const byTestId = (root: ReactTestRenderer, testID: string) => hosts(root).filter((node) => node.props.testID === testID)
const nameOf = (node: ReactTestInstance) => typeof node.props.accessibilityLabel === 'string'
  ? node.props.accessibilityLabel
  : node.findAll((child) => String(child.type) === 'Text').map((child) => renderedText(child.props.children)).join(' ')
const control = (root: ReactTestRenderer, name: string) => {
  const found = hosts(root).find((node) => typeof node.props.onPress === 'function' && nameOf(node) === name)
  if (!found) throw new Error(`No control named ${name}`)
  return found
}
const press = (node: ReactTestInstance) => renderer.act(() => { (node.props.onPress as () => void)() })
const travelOpacity = (root: ReactTestRenderer) => JSON.stringify(byTestId(root, 'wrapped-slide-travel')[0]!.props.style)
const progress = (catalog: typeof ptBR | typeof en, current: number) => catalog.wrapped.progressLabel.replace('{current}', String(current)).replace('{total}', String(slides.length))
const slideText = (root: ReactTestRenderer, kind: string) => byTestId(root, `wrapped-slide-${kind}`)[0]!
  .findAll((node) => typeof node.type === 'string' && node.type.endsWith('Text')).map((node) => renderedText(node.props.children)).join('|')

async function slideTexts(root: ReactTestRenderer) {
  const texts: Record<string, string> = {}
  for (const kind of SLIDE_KINDS) {
    texts[kind] = slideText(root, kind)
    if (kind !== 'share') await press(control(root, ptBR.wrapped.next))
  }
  return texts
}

beforeEach(() => {
  mocks.reducedMotion = false
  reanimatedTestState.reducedMotion = false
  mocks.share.mockReset()
  mocks.download.mockReset()
  __setWindowDimensions({ width: 360, height: 800, scale: 1, fontScale: 1 })
})

afterEach(async () => {
  await renderer.act(() => { tree?.unmount() })
  tree = null
})

describe('the guided Wrapped player on Android', () => {
  it('builds the eight slide kinds from the fixed recap', () => {
    expect(slides.map((slide) => slide.id)).toEqual([...SLIDE_KINDS])
  })

  it.each(LOCALES)('moves one slide for next and previous, and the progress label follows in $locale', async ({ locale, catalog }) => {
    enableTestFlags('orbit_guided_flows')
    const root = await renderPlayer(locale)
    const labels = () => hosts(root).map((node) => node.props.accessibilityLabel)

    expect(labels()).toContain(progress(catalog, 1))
    expect(byTestId(root, 'wrapped-slide-intro')).toHaveLength(1)
    await press(control(root, catalog.wrapped.next))
    expect(labels()).toContain(progress(catalog, 2))
    expect(byTestId(root, 'wrapped-slide-completions')).toHaveLength(1)
    await press(control(root, catalog.wrapped.previous))
    expect(labels()).toContain(progress(catalog, 1))
    expect(byTestId(root, 'wrapped-slide-intro')).toHaveLength(1)
    expect(control(root, catalog.wrapped.close)).toBeTruthy()
  })

  it('keeps the first slide still, then starts each slide change from the shifted and faded frame', async () => {
    enableTestFlags('orbit_guided_flows')
    const root = await renderPlayer()

    expect(travelOpacity(root)).toContain('"opacity":{"value":1}')
    await press(control(root, ptBR.wrapped.next))
    expect(travelOpacity(root)).toContain('"opacity":{"value":0}')
    await press(control(root, ptBR.wrapped.previous))
    expect(travelOpacity(root)).toContain('"opacity":{"value":0}')
  })

  it('keeps every slide still under reduced motion: no slide travel, no part rise and no running Orbit loop', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.reducedMotion = true
    reanimatedTestState.reducedMotion = true
    const root = await renderPlayer()

    for (const kind of SLIDE_KINDS) {
      expect(byTestId(root, `wrapped-slide-${kind}`)).toHaveLength(1)
      expect(travelOpacity(root)).toContain('"opacity":{"value":1}')
      for (const part of hosts(root).filter((node) => String(node.props.nativeID).startsWith('wrapped-motion-part-'))) expect(part.props.entering).toBeUndefined()
      for (const orbit of byTestId(root, 'orbit-mascot')) expect(orbit.props['data-orbit-loop']).toBe('still')
      if (kind !== 'share') await press(control(root, ptBR.wrapped.next))
    }
  })

  it('renders the same text and figures on each of the eight slides as the current player', async () => {
    const current = await renderPlayer()
    const currentTexts = await slideTexts(current)
    expect(currentTexts.completions).toContain(String(recap.metrics.totalCompletions))
    for (const kind of SLIDE_KINDS) expect(currentTexts[kind]).not.toBe('')
    await renderer.act(() => { current.unmount() })
    tree = null

    enableTestFlags('orbit_guided_flows')
    expect(await slideTexts(await renderPlayer())).toEqual(currentTexts)
  })

  it.each(LOCALES)('shows Orbit in Feliz on the last slide, and share and download call the current adapters in $locale', async ({ locale, catalog }) => {
    enableTestFlags('orbit_guided_flows')
    const root = await renderPlayer(locale)
    for (let step = 1; step < slides.length; step += 1) await press(control(root, catalog.wrapped.next))

    const slide = byTestId(root, 'wrapped-slide-share')[0]!
    const rigs = slide.findAll((node) => node.props.testID === 'orbit-mascot' && node.props['data-orbit-face'] === 'rig' && typeof node.type === 'string')
    expect(rigs).toHaveLength(1)
    expect(rigs[0]!.props).toMatchObject({ 'data-orbit-state': 'feliz', width: 96 })

    const card = byTestId(root, 'share-card')[0]!
    const cardMarks = card.findAll((node) => node.props.testID === 'orbit-mascot' && typeof node.type === 'string')
    expect(cardMarks).toHaveLength(1)
    expect(cardMarks[0]!.props).toMatchObject({ 'data-orbit-face': 'small', 'data-orbit-loop': 'still' })

    await press(control(root, catalog.shareCard.share))
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ shareTitle: catalog.shareCard.shareTitle, url: recap.shareDeepLink }))
    await press(control(root, catalog.shareCard.download))
    expect(mocks.download).toHaveBeenCalledTimes(1)
  })

  it.each([320, 360, 384, 412].flatMap((width) => LOCALES.map(({ locale, catalog }) => ({ width, locale, catalog }))))(
    'keeps every part of every guided slide inside the slide column, with Orbit and the preview of the share slide in it, at $width px in $locale', async ({ width, locale, catalog }) => {
      enableTestFlags('orbit_guided_flows')
      mocks.reducedMotion = true
      reanimatedTestState.reducedMotion = true
      __setWindowDimensions({ width, height: 800, scale: 1, fontScale: 1 })
      const root = await renderPlayer(locale)

      for (const kind of SLIDE_KINDS) {
        let part = 0
        const boxes = measureSafeArea((root as GeometryTree).toJSON(), (host) => {
          const props = host.props as GeometryHost['props'] & { nativeID?: string; 'data-orbit-face'?: string }
          if (props.testID === 'wrapped-page-scroll') return 'column'
          if (props.testID === 'orbit-mascot' && props['data-orbit-face'] === 'rig') return 'orbit'
          if (props.testID === 'wrapped-figure') return `figure-${part++}`
          return props.nativeID?.startsWith('wrapped-motion-part-') ? `part-${part++}` : undefined
        }, { width, height: 800 })
        const column = boxes.get('column')!
        const outside = [...boxes].filter(([key, box]) => key !== 'column' && (box.left < column.left - 0.5 || box.left + box.width > column.left + column.width + 0.5))
        expect(outside, `${kind}: ${JSON.stringify(outside)}`).toEqual([])
        expect([...boxes.keys()].filter((key) => key !== 'column').length, kind).toBeGreaterThan(0)
        if (kind === 'share') {
          expect(boxes.has('orbit')).toBe(true)
          expect([...boxes.keys()].some((key) => key.startsWith('figure-'))).toBe(true)
        } else await press(control(root, catalog.wrapped.next))
      }
    })

  it('renders the current player with the flag off: no slide travel and no Orbit in Feliz on the last slide', async () => {
    const root = await renderPlayer()

    expect(byTestId(root, 'wrapped-slide-travel')).toHaveLength(0)
    for (let step = 1; step < slides.length; step += 1) await press(control(root, ptBR.wrapped.next))
    expect(byTestId(root, 'wrapped-slide-share')).toHaveLength(1)
    expect(byTestId(root, 'orbit-mascot').some((node) => node.props['data-orbit-state'] === 'feliz')).toBe(false)
  })
})
