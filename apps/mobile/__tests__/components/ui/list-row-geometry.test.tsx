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
import { Badge } from '@/components/ui/badge'
import { measureProfileRow, replayProfileTitleLayout as replayLabelLayout } from '../../support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(() => {
  __resetTestHostConfig()
  preferenceLocale.value = undefined
})

vi.mock('@/hooks/use-shell-notice-slot', () => ({ useShellNoticeSlot: vi.fn() }))
const preferenceLocale = vi.hoisted((): { value: 'en' | 'pt-BR' | undefined } => ({ value: undefined }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => preferenceLocale.value
      ? key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], preferenceLocale.value === 'en' ? en : ptBR)
      : params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: preferenceLocale.value ?? 'en' },
  }),
}))
vi.mock('@/app/use-preference-controls', () => ({ usePreferenceControls: () => ({ selectedLanguage: preferenceLocale.value, currentTheme: 'dark', currentScheme: 'orange', showGeneralOnToday: true, handleShowGeneralToggle: vi.fn(), activePicker: null, setActivePicker: vi.fn(), handleThemeModeChange: vi.fn(), timeZoneMutation: { mutate: vi.fn() }, weekStartMutation: { mutate: vi.fn() }, clockFormatMutation: { mutate: vi.fn() } }) }))
vi.mock('@/components/profile/preferences-sections', () => ({ PreferencePickerSheet: () => null }))

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/app-toast', () => ({ Toast: () => null }))
vi.mock('@/lib/posthog', () => ({ getAnalyticsOptOut: () => Promise.resolve(false), setAnalyticsOptOut: vi.fn() }))
vi.mock('@/app/(tabs)/profile/_components/use-data-export', () => ({ useDataExport: () => ({ isExporting: false, exportDone: false, exportError: '', exportData: vi.fn(), clearExportDone: vi.fn() }) }))
vi.mock('@/app/(tabs)/profile/_components/edit-name-sheet', () => ({ EditNameSheet: () => null }))
vi.mock('@/app/(tabs)/profile/_components/fresh-start-modal', () => ({ FreshStartModal: () => null }))
vi.mock('@/app/(tabs)/profile/_components/delete-account-modal', () => ({ DeleteAccountModal: () => null }))

type Tree = ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
type HostRow = Parameters<typeof measureProfileRow>[0]

describe('account navigation row', () => {
  it.each([
    createMockProfile({ name: 'Ana', email: 'a@b.co' }),
    createMockProfile({ name: 'Pessoa com um nome completo escrito no próprio perfil', email: `${'longaddress'.repeat(12)}@example.com` }),
    undefined,
  ])('offers only the Conta navigation control with no details button', async (profile) => {
    push.mockClear()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<AccountNavigationRow profile={profile} submenu={PROFILE_SUBMENUS[0]} />) })
    try {
      const controls = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button')
      expect(controls.filter((node) => String(node.props.accessibilityLabel).startsWith('contextMenu.viewDetails'))).toHaveLength(0)
      expect(controls).toHaveLength(1)
      expect(controls[0]!.props.accessibilityLabel).toBe(`profile.submenus.accountLabel:${JSON.stringify({ name: profile?.name ?? 'profile.submenus.account', email: profile?.email ?? '' })}`)
      await act(() => (controls[0]!.props.onPress as () => void)())
      expect(push).toHaveBeenCalledExactlyOnceWith('/profile/account')
      expect(tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button')).toHaveLength(1)
    } finally { await act(() => tree.update(<></>)) }
  })
})

function firstRowBody(host: HostRow | HostRow[]): HostRow | undefined {
  if (Array.isArray(host)) return host.map(firstRowBody).find(Boolean)
  if (host.props['data-slot'] === 'list-row-body') return host
  return (host.children ?? []).filter((child): child is HostRow => typeof child !== 'string').map(firstRowBody).find(Boolean)
}

describe('personal account row geometry', () => {
  it.each([412, 600, 840, 1100, 1352].flatMap((width) => [1, 2].flatMap((fontScale) => ['Ana', 'Ana Silva'].map((name) => ({ width, fontScale, name })))))('matches Conta, Perfil and plain text at $width, scale $fontScale for $name', async ({ width, fontScale, name }) => {
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


describe('label mode transitions', () => {
  it.each([en, ptBR])('clears label alignment when a wrapped toggle becomes a gated row', async (words) => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
    const title = words.habits.detail.slipAlert
    const description = words.habits.detail.slipAlertDescription
    const locked = <ListRow title={title} description={description} trailing={<Badge>{words.habits.detail.proGate}</Badge>} onClick={vi.fn()} />
    let changed!: Tree
    let fresh!: Tree
    await act(() => {
      changed = create(<ListRow title={title} description={description} toggle={{ checked: true, onChange: vi.fn() }} />) as Tree
      fresh = create(locked) as Tree
    })
    try {
      await replayLabelLayout(changed, 200, 2)
      expect(measureProfileRow(changed.toJSON(), 200, 2).texts[0]!.lines).toBeGreaterThan(1)
      await act(() => changed.update(locked))
      await replayLabelLayout(changed, 200, 2)
      await replayLabelLayout(fresh, 200, 2)
      const transitioned = measureProfileRow(changed.toJSON(), 200, 2)
      const original = measureProfileRow(fresh.toJSON(), 200, 2)
      const changedControl = transitioned.parts.find((part) => part.slot === 'list-row-trailing')!
      const freshControl = original.parts.find((part) => part.slot === 'list-row-trailing')!
      expect(changedControl.top).toBeCloseTo(freshControl.top, 4)
      expect(transitioned.height).toBeCloseTo(original.height, 4)
    } finally { await act(() => { changed.update(<></>); fresh.update(<></>) }) }
  })
})

describe('single-line label accessories', () => {
  it.each([en, ptBR].flatMap((words) => ['value', 'description'].map((kind) => ({ words, kind }))))('centres enlarged icons and chevrons beside a $kind', async ({ words, kind }) => {
    __setWindowDimensions({ width: 1352, height: 915, scale: 1, fontScale: 2 })
    const title = words.profile.settingsRows.theme
    let tree!: Tree
    await act(() => { tree = create(<ListRow textMode="label" title={title} icon="home" value={kind === 'value' ? words.profile.settingsRows.theme : undefined} description={kind === 'description' ? words.settings.homeScreen.showGeneral : undefined} onClick={vi.fn()} />) as Tree })
    try {
      await replayLabelLayout(tree, 740, 2)
      const geometry = measureProfileRow(tree.toJSON(), 740, 2)
      const label = geometry.texts.find((text) => text.label === title)!
      expect(label.lines).toBe(1)
      const accessories = geometry.parts.filter((part) => part.slot === 'list-row-icon' || part.slot === 'list-row-chevron')
      expect(accessories).toHaveLength(2)
      for (const accessory of accessories) expect(Math.abs(label.top + label.height / 2 - accessory.top - accessory.height / 2), accessory.slot).toBeLessThanOrEqual(1)
    } finally { await act(() => tree.update(<></>)) }
  })
})

function androidDoubleTextPixels(size: number) {
  const points = [[0, 0], [8, 16], [10, 20], [12, 24], [14, 26], [18, 30], [20, 34], [24, 36], [30, 38], [100, 100]] as const
  const upper = points.findIndex(([input]) => input >= size)
  const [start, startPixels] = points[upper - 1]!
  const [end, endPixels] = points[upper]!
  return startPixels + (size - start) / (end - start) * (endPixels - startPixels)
}

describe('native nonlinear first-line geometry', () => {
  it.each([en, ptBR].flatMap((words) => ['description', 'value', 'switch', 'badge'].map((kind) => ({ words, kind }))))('uses measured native lines beside a $kind', async ({ words, kind }) => {
    __setWindowDimensions({ width: 1352, height: 915, scale: 1, fontScale: 2 })
    const title = kind === 'switch' ? words.profile.analytics.title : words.profile.settingsRows.theme
    const width = kind === 'switch' ? 200 : 740
    let tree!: Tree
    await act(() => { tree = create(<ListRow textMode="label" title={title} icon="home" description={kind === 'description' || kind === 'badge' ? words.settings.homeScreen.showGeneral : undefined} trailing={kind === 'badge' ? <Badge>{words.common.proBadge}</Badge> : undefined} value={kind === 'value' ? title : undefined} toggle={kind === 'switch' ? { checked: true, onChange: vi.fn() } : undefined} onClick={vi.fn()} />) as Tree })
    try {
      await replayLabelLayout(tree, width, 2, androidDoubleTextPixels)
      const geometry = measureProfileRow(tree.toJSON(), width, 2, androidDoubleTextPixels)
      const label = geometry.texts.find((text) => text.label === title)!
      const lineCentre = label.top + label.height / label.lines / 2
      const accessories = geometry.parts.filter((part) => ['list-row-icon', 'list-row-chevron', 'switch-track', ...(kind === 'badge' ? ['list-row-trailing'] : [])].includes(part.slot))
      expect(accessories).toHaveLength(kind === 'badge' ? 3 : 2)
      for (const accessory of accessories) expect(Math.abs(lineCentre - accessory.top - accessory.height / 2), accessory.slot).toBeLessThanOrEqual(1)
      if (kind === 'switch') expect(label.lines).toBeGreaterThan(1)
      const value = geometry.texts.find((text) => text !== label && text.label === title)
      if (value) expect(Math.abs(lineCentre - value.top - value.height / 2)).toBeLessThanOrEqual(1)
    } finally { await act(() => tree.update(<></>)) }
  })
})
