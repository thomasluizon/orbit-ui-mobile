import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionPresets } from '@orbit/shared/theme'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { testI18n } from '@/__tests__/support/i18n'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ShareCardSheet } from '@/components/share/share-card-sheet'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
  share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn(), refetch: vi.fn(),
  isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false,
  canShareFiles: true, savedFileName: null as string | null,
}))

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => ({ stats: null, isError: false }) }))
vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: (period: RecapSharePeriod) => ({
  recap: createMockRecap({ period, metrics: createMockRetrospectiveMetrics({ activeDays: mocks.isEmpty ? 0 : 5, totalCompletions: mocks.isEmpty ? 0 : 40, completionRate: mocks.isEmpty ? 0 : 73.5 }) }),
  isLoading: mocks.isLoading, isError: mocks.isError, refetch: mocks.refetch,
}) }))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    shareRef: { current: null }, isSharing: mocks.isSharing, hasError: mocks.hasError, savedFileName: mocks.savedFileName,
    canShareFiles: mocks.canShareFiles, share: mocks.share, download: mocks.download, resetFeedback: mocks.resetFeedback,
  }),
}))

const LOCALES = [{ locale: 'pt-BR', copy: ptBR.shareCard }, { locale: 'en', copy: en.shareCard }] as const
const PERIODS = ['week', 'month', 'year'] as const

let tree: ReactTestRenderer | null = null

async function renderSheet(locale: 'pt-BR' | 'en' = 'pt-BR') {
  await testI18n.changeLanguage(locale)
  await renderer.act(() => { tree = renderer.create(<ShareCardSheet onClose={vi.fn()} />) })
  return tree!
}

const hosts = (root: ReactTestRenderer): ReactTestInstance[] => root.root.findAll((node) => typeof node.type === 'string')
const byTestId = (root: ReactTestRenderer, testID: string) => hosts(root).filter((node) => node.props.testID === testID)
const texts = (root: ReactTestRenderer) => hosts(root).filter((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children))
const nameOf = (node: ReactTestInstance) => typeof node.props.accessibilityLabel === 'string'
  ? node.props.accessibilityLabel
  : node.findAll((child) => String(child.type) === 'Text').map((child) => renderedText(child.props.children)).join(' ')
const control = (root: ReactTestRenderer, name: string) => {
  const found = hosts(root).find((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button' && nameOf(node) === name)
  if (!found) throw new Error(`No control named ${name}`)
  return found
}
const press = (node: ReactTestInstance) => renderer.act(() => { (node.props.onPress as () => void)() })
const options = (root: ReactTestRenderer) => byTestId(root, 'option-card')
const rigs = (root: ReactTestRenderer) => byTestId(root, 'orbit-mascot').filter((node) => node.props['data-orbit-face'] === 'rig')
const cardTexts = (root: ReactTestRenderer) => byTestId(root, 'share-card')[0]!.findAll((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children))
const sheetTitle = (root: ReactTestRenderer) => hosts(root).find((node) => String(node.type) === 'Sheet')!.props.title as string

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks, { reducedMotion: false, isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false, canShareFiles: true, savedFileName: null })
  __setWindowDimensions({ width: 360, height: 800, scale: 1, fontScale: 1 })
})

afterEach(async () => {
  await renderer.act(() => { tree?.unmount() })
  tree = null
})

describe('the guided share card sheet on Android', () => {
  it.each(LOCALES)('uses the period question as the heading and offers exactly three periods that change the preview in $locale', async ({ locale, copy }) => {
    enableTestFlags('orbit_guided_flows')
    const root = await renderSheet(locale)

    expect(sheetTitle(root)).toBe(copy.periodQuestion)
    expect(byTestId(root, 'share-period-options')[0]!.props.accessibilityLabel).toBe(copy.periodQuestion)
    expect(byTestId(root, 'share-period-question')).toHaveLength(0)
    expect(options(root).map(nameOf)).toEqual(PERIODS.map((period) => copy.periods[period]))
    expect(options(root)[0]!.props.accessibilityState).toMatchObject({ selected: true })

    for (const [index, period] of PERIODS.entries()) {
      await press(options(root)[index]!)
      expect(options(root)[index]!.props.accessibilityState).toMatchObject({ selected: true })
      expect(cardTexts(root)).toContain(copy.periods[period])
    }
    expect(mocks.resetFeedback).toHaveBeenCalledTimes(PERIODS.length)
  })

  it.each([
    { reduced: false, scale: motionPresets.selection.scaleFrom },
    { reduced: true, scale: 1 },
  ])('brings the new preview in from scale $scale when reduced motion is $reduced, and keeps the first preview still', async ({ reduced, scale }) => {
    enableTestFlags('orbit_guided_flows')
    mocks.reducedMotion = reduced
    const root = await renderSheet()
    const previewStyle = () => JSON.stringify(byTestId(root, 'share-preview')[0]!.props.style)

    expect(previewStyle()).toContain('"opacity":{"value":1}')
    await press(options(root)[1]!)
    expect(previewStyle()).toContain('"opacity":{"value":0}')
    expect(previewStyle()).toContain(`"transform":[{"scale":${scale}}]`)
  })

  it('keeps preview, share and download, and the saved feedback', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.savedFileName = 'orbit-recap.png'
    const root = await renderSheet()

    expect(cardTexts(root)).toContain('74%')
    await press(control(root, ptBR.shareCard.share))
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ shareTitle: ptBR.shareCard.shareTitle, url: createMockRecap().shareDeepLink }))
    await press(control(root, ptBR.shareCard.download))
    expect(mocks.download).toHaveBeenCalledOnce()
    expect(texts(root)).toContain(ptBR.shareCard.saved.replace('{file}', 'orbit-recap.png'))
  })

  it('shows no error text after a share that the person cancels', async () => {
    enableTestFlags('orbit_guided_flows')
    const root = await renderSheet()

    await press(control(root, ptBR.shareCard.share))
    expect(texts(root)).not.toContain(ptBR.shareCard.shareError)
  })

  it('shows the current failure message after a share that fails', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.hasError = true
    const root = await renderSheet()

    expect(texts(root)).toContain(ptBR.shareCard.shareError)
  })

  it.each(LOCALES)('keeps the title and shows the empty sentence with Orbit in Parado in $locale', async ({ locale, copy }) => {
    enableTestFlags('orbit_guided_flows')
    mocks.isEmpty = true
    const root = await renderSheet(locale)

    expect(sheetTitle(root)).toBe(copy.periodQuestion)
    expect(texts(root)).toContain(copy.empty)
    expect(rigs(root)).toHaveLength(1)
    expect(rigs(root)[0]!.props).toMatchObject({ 'data-orbit-state': 'parado', width: 96 })
    expect(byTestId(root, 'share-card')).toHaveLength(0)
  })

  it('shows Orbit in Parado on the load error, and retry reads the recap again', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.isError = true
    const root = await renderSheet()

    const error = byTestId(root, 'share-error')[0]!
    expect(error.findAll((node) => node.props.accessibilityRole === 'alert' && node.props.accessibilityLabel === ptBR.shareCard.error).length).toBeGreaterThan(0)
    expect(rigs(root)).toHaveLength(1)
    expect(rigs(root)[0]!.props['data-orbit-state']).toBe('parado')
    await press(control(root, ptBR.common.retry))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('keeps the loading skeleton and stops the period options during a capture', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.isLoading = true
    const loading = await renderSheet()
    expect(hosts(loading).some((node) => node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === ptBR.shareCard.loading)).toBe(true)
    await renderer.act(() => { loading.unmount() })
    tree = null

    Object.assign(mocks, { isLoading: false, isSharing: true })
    const root = await renderSheet()
    for (const option of options(root)) expect(option.props.accessibilityState).toMatchObject({ disabled: true })
  })

  it.each(['row', 'button'] as const)('opens the guided sheet from the share entry %s', async (variant) => {
    enableTestFlags('orbit_guided_flows')
    await testI18n.changeLanguage('pt-BR')
    await renderer.act(() => { tree = renderer.create(<ShareCardEntryButton variant={variant} />) })
    const root = tree!

    expect(options(root)).toHaveLength(0)
    await press(control(root, ptBR.shareCard.entry))
    expect(sheetTitle(root)).toBe(ptBR.shareCard.periodQuestion)
    expect(options(root)).toHaveLength(3)
    expect(byTestId(root, 'share-card')).toHaveLength(1)
  })

  it('renders the current sheet with the flag off', async () => {
    const root = await renderSheet()

    expect(sheetTitle(root)).toBe(ptBR.shareCard.share)
    expect(byTestId(root, 'share-period-question')).toHaveLength(1)
    expect(options(root)).toHaveLength(0)
    expect(byTestId(root, 'share-preview')).toHaveLength(0)
  })
})
