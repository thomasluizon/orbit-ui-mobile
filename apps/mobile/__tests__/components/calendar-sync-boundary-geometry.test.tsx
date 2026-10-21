import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import { CalendarSyncBoundary } from '@/app/(tabs)/calendar/_components/calendar-sync-boundary'
import { Sheet } from '@/components/ui/sheet'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

vi.unmock('react-i18next')
vi.unmock('@/components/ui/sheet')
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn(async () => {})
    dismiss = vi.fn(async () => {})
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
  },
}))
const TestRenderer = require('react-test-renderer')
afterEach(async () => { await i18n.changeLanguage('en') })

function renderBoundary() {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<Sheet open title={i18n.t('calendar.calendars.title')} onClose={vi.fn()}>
    <CalendarSyncBoundary isConnected hasProAccess autoSyncState={undefined} onAutoSyncChange={async () => {}} onSyncNow={async () => {}}
      locale={i18n.language} t={i18n.t} tokens={createTokensV2('orange', 'dark')} />
  </Sheet>) })
  return tree
}

function textWidth(text: string, fontSize: number) {
  const font = require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')
  const bounds = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100"><text y="50" font-family="Geist" font-size="${fontSize}">${text}</text></svg>`, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
  return bounds.x + bounds.width
}

function measureBoundary(tree: ReturnType<typeof TestRenderer.create>, width: number) {
  type Host = Parameters<typeof measureProfileRow>[0]
  function findBody(hosts: Host[]): Host | undefined {
    for (const host of hosts) {
      if (host.props.testID === 'sheet-body-scroll') return host
      const found = findBody((host.children ?? []).filter((child): child is Host => typeof child !== 'string'))
      if (found) return found
    }
    return undefined
  }
  const roots = tree.toJSON()
  return measureProfileRow(findBody(Array.isArray(roots) ? roots : [roots])!, width, 1)
}

describe('Android Calendars sync boundary label geometry', () => {
  it.each([320, 360, 384, 412].flatMap((width) => ['en', 'pt-BR'].map((locale) => ({ width, locale }))))('fits the current sync controls at $width in $locale', async ({ width, locale }) => {
    await i18n.changeLanguage(locale)
    const tree = renderBoundary()
    try {
      const measured = measureBoundary(tree, width)
      for (const key of ['calendar.dayDetail.googleConnected', 'calendar.autoSync.automaticImport']) {
        const text = measured.texts.find((text) => text.label === i18n.t(key))!
        expect(text, key).toBeDefined()
        expect(text.lines, JSON.stringify(text)).toBe(1)
        expect(text.clipped).toBe(false)
      }
      const sync = measured.controls.find((control) => control.accessibilityLabel === i18n.t('calendar.autoSync.syncNow'))!
      expect(sync.width).toBeGreaterThanOrEqual(48)
      expect(sync.height).toBeGreaterThanOrEqual(48)
      const title = measured.texts.find((text) => text.label === i18n.t('calendar.autoSync.automaticImport'))!
      const titleHost = tree.root.findAllByType('Text').find((node: { props: { children?: unknown } }) => node.props.children === title.label)!
      expect(textWidth(title.label, Number(StyleSheet.flatten(titleHost.props.style).fontSize))).toBeLessThanOrEqual(title.width)
      const body = tree.root.findAllByType('ScrollView').find((node: { props: { testID?: string } }) => node.props.testID === 'sheet-body-scroll')!
      expect(StyleSheet.flatten(body.props.contentContainerStyle).paddingHorizontal).toBeGreaterThan(0)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it('measures the former label against the current column row at compact width', async () => {
    await i18n.changeLanguage('pt-BR')
    const tree = renderBoundary()
    try {
      const title = measureBoundary(tree, 320).texts.find((text) => text.label === i18n.t('calendar.autoSync.automaticImport'))!
      const titleHost = tree.root.findAllByType('Text').find((node: { props: { children?: unknown } }) => node.props.children === title.label)!
      expect(textWidth('Sincronização automática', Number(StyleSheet.flatten(titleHost.props.style).fontSize))).toBeLessThanOrEqual(title.width)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })
})
