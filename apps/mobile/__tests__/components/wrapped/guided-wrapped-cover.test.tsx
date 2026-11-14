import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { testI18n } from '@/__tests__/support/i18n'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'
import { createTokensV2 } from '@/lib/theme'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

const mocks = vi.hoisted(() => ({ reducedMotion: false }))

vi.mock('react-i18next', async (original) => ({
  ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', async (original) => ({ ...await original<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))

type CoverProps = Parameters<typeof WrappedCover>[0]
const LOCALES = [{ locale: 'pt-BR', copy: ptBR.wrapped }, { locale: 'en', copy: en.wrapped }] as const
const tokens = createTokensV2('orange', 'dark')

let tree: ReactTestRenderer | null = null

async function renderCover(locale: 'pt-BR' | 'en', overrides: Partial<CoverProps> = {}) {
  await testI18n.changeLanguage(locale)
  const props: CoverProps = { tokens, period: 'week', state: 'ready', onSelectPeriod: vi.fn(), onStart: vi.fn(), onRetry: vi.fn(), ...overrides }
  await renderer.act(() => { tree = renderer.create(<WrappedCover {...props} />) })
  return { root: tree!, props, showPeriod: (period: RecapSharePeriod) => renderer.act(() => { tree!.update(<WrappedCover {...props} period={period} />) }) }
}

const hosts = (root: ReactTestRenderer): ReactTestInstance[] => root.root.findAll((node) => typeof node.type === 'string')
const byTestId = (root: ReactTestRenderer, testID: string) => hosts(root).filter((node) => node.props.testID === testID)
const mascots = (root: ReactTestRenderer) => byTestId(root, 'orbit-mascot')
const texts = (root: ReactTestRenderer) => hosts(root).filter((node) => String(node.type) === 'Text').map((node) => renderedText(node.props.children))
const pressables = (root: ReactTestRenderer) => hosts(root).filter((node) => typeof node.props.onPress === 'function')
const nameOf = (node: ReactTestInstance) => typeof node.props.accessibilityLabel === 'string'
  ? node.props.accessibilityLabel
  : node.findAll((child) => String(child.type) === 'Text').map((child) => renderedText(child.props.children)).join(' ')
const press = (node: ReactTestInstance) => renderer.act(() => { (node.props.onPress as () => void)() })

beforeEach(() => {
  mocks.reducedMotion = false
  reanimatedTestState.reducedMotion = false
  __setWindowDimensions({ width: 360, height: 800, scale: 1, fontScale: 1 })
})

afterEach(async () => {
  await renderer.act(() => { tree?.unmount() })
  tree = null
})

describe('the guided Wrapped cover on Android', () => {
  it.each(LOCALES)('shows Orbit in Parado, the period question, three quick options and the start action in $locale', async ({ locale, copy }) => {
    enableTestFlags('orbit_guided_flows')
    const { root, props } = await renderCover(locale)

    expect(mascots(root)).toHaveLength(1)
    expect(mascots(root)[0]!.props).toMatchObject({ 'data-orbit-state': 'parado', width: 96 })
    const title = hosts(root).find((node) => node.props.accessibilityRole === 'header' && renderedText(node.props.children) === copy.coverTitles.week)
    expect(title?.props.accessibilityHint).toBe(copy.coverSubtitle)
    expect(hosts(root).some((node) => node.props.accessibilityRole === 'header' && renderedText(node.props.children) === copy.periodQuestion)).toBe(true)
    expect(hosts(root).find((node) => node.props.role === 'group')?.props.accessibilityLabel).toBe(copy.periodQuestion)

    const options = byTestId(root, 'option-card')
    expect(options.map(nameOf)).toEqual(RECAP_SHARE_PERIODS.map((period) => copy.periods[period]))
    expect(options[0]!.props.accessibilityState).toMatchObject({ selected: true })
    await press(options[2]!)
    expect(props.onSelectPeriod).toHaveBeenCalledWith('year')
    expect(texts(root)).not.toContain(copy.periodGroup)

    await press(pressables(root).find((node) => nameOf(node) === copy.start)!)
    expect(props.onStart).toHaveBeenCalledTimes(1)
  })

  it.each(LOCALES)('names the empty period in the Orbit line and leaves the period control as the one action in $locale', async ({ locale, copy }) => {
    enableTestFlags('orbit_guided_flows')
    const { root } = await renderCover(locale, { state: 'empty' })

    expect(renderedText(byTestId(root, 'wrapped-orbit-line')[0]!.props.children)).toBe(copy.empty)
    expect(mascots(root)[0]!.props['data-orbit-state']).toBe('parado')
    expect(pressables(root).map(nameOf)).toEqual(RECAP_SHARE_PERIODS.map((period) => copy.periods[period]))
  })

  it('states the error in the Orbit line with Orbit in Parado, and retry reads the recap again', async () => {
    enableTestFlags('orbit_guided_flows')
    const { root, props } = await renderCover('pt-BR', { state: 'failed' })

    const line = byTestId(root, 'wrapped-orbit-line')[0]!
    expect(line.props.accessibilityRole).toBe('alert')
    expect(renderedText(line.props.children)).toBe(ptBR.wrapped.error)
    expect(mascots(root)[0]!.props['data-orbit-state']).toBe('parado')
    await press(pressables(root).find((node) => nameOf(node) === ptBR.wrapped.retry)!)
    expect(props.onRetry).toHaveBeenCalledTimes(1)
    expect(pressables(root).some((node) => nameOf(node) === ptBR.wrapped.start)).toBe(false)
  })

  it('keeps the start label on a waiting action while the recap loads, and announces the load', async () => {
    enableTestFlags('orbit_guided_flows')
    const { root } = await renderCover('pt-BR', { state: 'loading' })

    const start = hosts(root).find((node) => (node.props.accessibilityState as { busy?: boolean } | undefined)?.busy === true)!
    expect(nameOf(start)).toBe(ptBR.wrapped.start)
    expect(start.props.onPress).toBeUndefined()
    expect(hosts(root).find((node) => node.props.accessibilityLiveRegion === 'polite')?.props.children).toBe(ptBR.wrapped.loading)
  })

  it('draws Orbit at 128 and puts the start action inside the block at 1024 and above', async () => {
    enableTestFlags('orbit_guided_flows')
    __setWindowDimensions({ width: 1280, height: 800, scale: 1, fontScale: 1 })
    const { root } = await renderCover('pt-BR')

    expect(mascots(root)[0]!.props.width).toBe(128)
    const block = byTestId(root, 'wrapped-cover-block')[0]!
    expect(block.findAll((node) => node.props.testID === 'wrapped-cover-primary').length).toBeGreaterThan(0)
  })

  it.each([
    { reduced: false, startOpacity: 0, loop: 'running' },
    { reduced: true, startOpacity: 1, loop: 'still' },
  ])('starts the period fade at opacity $startOpacity when reduced motion is $reduced', async ({ reduced, startOpacity, loop }) => {
    enableTestFlags('orbit_guided_flows')
    mocks.reducedMotion = reduced
    reanimatedTestState.reducedMotion = reduced
    const { root, showPeriod } = await renderCover('pt-BR')

    await showPeriod('month')
    const group = byTestId(root, 'wrapped-cover-period-group')[0]!
    expect(JSON.stringify(group.props.style)).toContain(`"opacity":{"value":${startOpacity}}`)
    expect(texts(root)).toContain(ptBR.wrapped.coverTitles.month)
    expect(mascots(root)[0]!.props['data-orbit-loop']).toBe(loop)
  })

  it('renders the current cover with the flag off', async () => {
    const { root } = await renderCover('pt-BR')

    expect(byTestId(root, 'wrapped-cover-block')).toHaveLength(0)
    expect(byTestId(root, 'option-card')).toHaveLength(0)
    expect(hosts(root).find((node) => node.props.role === 'group')?.props.accessibilityLabel).toBe(ptBR.wrapped.periodGroup)
    expect(texts(root)).toContain(ptBR.wrapped.coverSubtitle)
    expect(texts(root)).not.toContain(ptBR.wrapped.periodQuestion)
  })
})
