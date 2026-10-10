import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { AccountNavigationRow } from '@/app/(tabs)/profile/_components/account-navigation-row'
import { ProfileAccountContent } from '@/app/(tabs)/profile/_components/profile-account-content'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ListRow } from '@/components/ui/list-row'
import { measureProfileRow } from '../../support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(__resetTestHostConfig)

vi.mock('@/hooks/use-shell-notice-slot', () => ({ useShellNoticeSlot: vi.fn() }))
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
