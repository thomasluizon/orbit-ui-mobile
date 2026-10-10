import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { AccountNavigationRow } from '@/app/(tabs)/profile/_components/account-navigation-row'
import { ProfileAccountContent } from '@/app/(tabs)/profile/_components/profile-account-content'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { ProfilePreferencesContent } from '@/app/(tabs)/profile/_components/profile-preferences-content'
import { ListRow } from '@/components/ui/list-row'
import { measureProfileRow } from '../../support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(__resetTestHostConfig)

vi.mock('@/hooks/use-shell-notice-slot', () => ({ useShellNoticeSlot: vi.fn() }))
const preferenceLocale = vi.hoisted((): { value: 'en' | 'pt-BR' } => ({ value: 'en' }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], preferenceLocale.value === 'en' ? en : ptBR), i18n: { language: preferenceLocale.value } }) }))
vi.mock('@/app/use-preference-controls', () => ({ usePreferenceControls: () => ({ selectedLanguage: preferenceLocale.value, currentTheme: 'dark', currentScheme: 'orange', showGeneralOnToday: true, handleShowGeneralToggle: vi.fn(), activePicker: null, setActivePicker: vi.fn(), handleThemeModeChange: vi.fn(), timeZoneMutation: { mutate: vi.fn() }, weekStartMutation: { mutate: vi.fn() }, clockFormatMutation: { mutate: vi.fn() } }) }))
vi.mock('@/components/profile/preferences-sections', () => ({ PreferencePickerSheet: () => null }))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/app-toast', () => ({ Toast: () => null }))
vi.mock('@/lib/posthog', () => ({ getAnalyticsOptOut: () => Promise.resolve(false), setAnalyticsOptOut: vi.fn() }))
vi.mock('@/app/(tabs)/profile/_components/use-data-export', () => ({ useDataExport: () => ({ isExporting: false, exportDone: false, exportError: '', exportData: vi.fn(), clearExportDone: vi.fn() }) }))
vi.mock('@/app/(tabs)/profile/_components/edit-name-sheet', () => ({ EditNameSheet: () => null }))
vi.mock('@/app/(tabs)/profile/_components/fresh-start-modal', () => ({ FreshStartModal: () => null }))
vi.mock('@/app/(tabs)/profile/_components/delete-account-modal', () => ({ DeleteAccountModal: () => null }))

type Tree = ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
type HostRow = Parameters<typeof measureProfileRow>[0]

function firstRowBody(host: HostRow | HostRow[]): HostRow | undefined {
  if (Array.isArray(host)) return host.map(firstRowBody).find(Boolean)
  if (host.props['data-slot'] === 'list-row-body') return host
  return (host.children ?? []).filter((child): child is HostRow => typeof child !== 'string').map(firstRowBody).find(Boolean)
}

describe('personal account row geometry', () => {
  it.each([600, 840, 1100, 1352].flatMap((width) => [1, 2].flatMap((fontScale) => ['Ana', 'Ana Silva'].map((name) => ({ width, fontScale, name })))))('matches Conta, Perfil and plain text at $width, scale $fontScale for $name', async ({ width, fontScale, name }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    const profile = createMockProfile({ name, email: 'ana@example.com' })
    const compositions = [<ProfileAccountContent key="account" profile={profile} patchProfile={vi.fn()} />, <AccountNavigationRow key="navigation" profile={profile} submenu={PROFILE_SUBMENUS[0]} />, <ListRow key="plain" title={name} description={profile.email} wrapTitle onClick={vi.fn()} />]
    const rows = []
    for (const composition of compositions) {
      let tree!: Tree
      await act(() => { tree = create(composition) as Tree })
      try {
        const geometry = measureProfileRow(firstRowBody(tree.toJSON())!, Math.min(width - 32, 740), fontScale)
        rows.push(geometry.height)
      } finally { await act(() => tree.update(<></>)) }
    }
    for (const height of rows) {
      if (fontScale === 1) expect(height).toBe(68)
      else expect(height).toBeGreaterThan(68)
      expect(height).toBeCloseTo(rows[2]!, 4)
    }
  })
})

describe('label switch row geometry', () => {
  it.each([320, 360, 384, 412].flatMap((width) => [en, ptBR].map((words) => ({ width, words }))))('reserves readable line boxes for paused labels at $width and font scale 2', async ({ width, words }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 2 })
    const paused = words.trial.expired
    for (const title of [paused.astraCeiling, paused.calendarSync, paused.retrospective, paused.proactiveAstra]) {
      let tree!: Tree
      await act(() => { tree = create(<ListRow readOnly textMode="label" title={title} description={paused.paused} />) as Tree })
      try {
        const geometry = measureProfileRow(tree.toJSON(), width - 48, 2)
        expect(geometry.texts).toHaveLength(2)
        for (const text of geometry.texts) {
          expect(text.clipped, text.label).toBe(false)
          expect(text.lineHeightRatio, text.label).toBeGreaterThanOrEqual(1.4)
          expect(text.bottom).toBeLessThanOrEqual(geometry.height - 12 + 0.001)
        }
      } finally { await act(() => tree.update(<></>)) }
    }
  })

  for (const title of [ptBR.profile.proactiveAstra.title, ptBR.profile.aiSummary.title]) {
    it.each([1, 2])(`aligns ${title} at font scale %s`, async (fontScale) => {
      __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
      let tree!: ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
      await act(() => { tree = create(<ListRow title={title} compact textMode="label" toggle={{ checked: true, onChange: () => {} }} />) as typeof tree })
      try {
        const geometry = measureProfileRow(tree.toJSON(), 288, fontScale)
        const label = geometry.texts.find((text) => text.label === title)!
        const control = geometry.controls.find((control) => control.accessibilityLabel === title)!
        expect(control.height).toBeGreaterThanOrEqual(48)
        expect(label.clipped).toBe(false)
        if (label.lines === 1) {
          expect(Math.abs(label.top + label.height / 2 - control.top - control.height / 2)).toBeLessThanOrEqual(1)
          if (fontScale === 1) expect(geometry.height).toBe(52)
          else expect(geometry.height).toBeGreaterThan(52)
        } else {
          expect(fontScale).toBe(2)
          expect(Math.abs(label.top + label.height / 2 - control.top - control.height / 2)).toBeLessThanOrEqual(1)
          expect(geometry.height).toBeGreaterThan(52)
        }
      } finally { await act(() => tree.update(<></>)) }
    })
  }
})


describe('inline preference control geometry', () => {
  it.each([412, 1352].flatMap((width) => [1, 2].flatMap((fontScale) => (['en', 'pt-BR'] as const).map((locale) => ({ width, fontScale, locale })))))('centres the composed theme row at $width and font scale $fontScale in $locale', async ({ width, fontScale, locale }) => {
    preferenceLocale.value = locale
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    let tree!: Tree
    await act(() => { tree = create(<ProfilePreferencesContent profile={createMockProfile()} patchProfile={vi.fn()} />) as Tree })
    try {
      await replayLabelLayout(tree, Math.min(width - 32, 740), fontScale)
      const geometry = measureProfileRow(tree.toJSON(), Math.min(width - 32, 740), fontScale)
      const rows = geometry.parts.filter((part) => part.slot === 'list-row-trailing')
      const theme = rows[0]!
      const label = geometry.texts.find((text) => text.label === (locale === 'en' ? en : ptBR).profile.settingsRows.theme)!
      expect(label.clipped).toBe(false)
      expect(Math.abs(label.top + label.height / label.lines / 2 - theme.top - theme.height / 2)).toBeLessThanOrEqual(1)
      const general = geometry.texts.find((text) => text.label === (locale === 'en' ? en : ptBR).settings.homeScreen.showGeneral)!
      const track = geometry.parts.find((part) => part.slot === 'switch-track')!
      expect(Math.abs(general.top + general.height / general.lines / 2 - track.top - track.height / 2)).toBeLessThanOrEqual(1)
    } finally { await act(() => tree.update(<></>)) }
  })
})


async function replayLabelLayout(tree: Tree, width: number, fontScale: number) {
  const measured = measureProfileRow(tree.toJSON(), width, fontScale)
  for (const title of tree.root.findAll((node) => String(node.type) === 'Text' && node.props['data-slot'] === 'list-row-title')) {
    const label = measured.texts.find((text) => text.label === title.props.children)!
    const onTextLayout = title.props.onTextLayout as (event: { nativeEvent: { lines: { text: string; x: number; y: number; width: number; height: number; descender: number; capHeight: number; ascender: number; xHeight: number }[] } }) => void
    const height = label.height / label.lines
    await act(() => onTextLayout({ nativeEvent: { lines: Array.from({ length: label.lines }, (_, index) => ({ text: label.label, x: 0, y: index * height, width: label.width, height, descender: 0, capHeight: height, ascender: height, xHeight: height })) } }))
  }
}

describe('label control first-line alignment', () => {
  it.each([en, ptBR].flatMap((words) => [1, 2].map((fontScale) => ({ words, fontScale }))))('aligns the first line at font scale $fontScale', async ({ words, fontScale }) => {
    const title = words.profile.analytics.title
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
    let tree!: Tree
    await act(() => { tree = create(<ListRow title={title} icon="home" toggle={{ checked: true, onChange: vi.fn() }} />) as Tree })
    try {
      await replayLabelLayout(tree, 288, fontScale)
      const geometry = measureProfileRow(tree.toJSON(), 288, fontScale)
      const label = geometry.texts.find((text) => text.label === title)!
      const track = geometry.parts.find((part) => part.slot === 'switch-track')!
      const lineCentre = label.top + label.height / label.lines / 2
      expect(Math.abs(lineCentre - track.top - track.height / 2)).toBeLessThanOrEqual(1)
      expect(label.clipped).toBe(false)
      expect(label.bottom).toBeLessThanOrEqual(geometry.height - 12 + 1)
      if (fontScale === 1) expect(label.lines).toBe(1)
      else expect(label.lines).toBeGreaterThan(1)
      await act(() => tree.update(<ListRow title={words.profile.settingsRows.theme} toggle={{ checked: true, onChange: vi.fn() }} />))
      await replayLabelLayout(tree, 288, fontScale)
      const resized = measureProfileRow(tree.toJSON(), 288, fontScale)
      const short = resized.texts[0]!
      const switchTrack = resized.parts.find((part) => part.slot === 'switch-track')!
      expect(short.lines).toBe(1)
      expect(Math.abs(short.top + short.height / 2 - switchTrack.top - switchTrack.height / 2)).toBeLessThanOrEqual(1)
    } finally { await act(() => tree.update(<></>)) }
  })
})
