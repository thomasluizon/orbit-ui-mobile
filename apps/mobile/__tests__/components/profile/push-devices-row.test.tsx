import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pressable, StyleSheet, Text } from 'react-native'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'settings.notifications.deniedNative': ptBr.settings.notifications.deniedNative,
        'settings.notifications.syncFailed': ptBr.settings.notifications.syncFailed,
        'settings.notifications.tokenMissing': ptBr.settings.notifications.tokenMissing,
        'settings.notifications.openSettings': ptBr.settings.notifications.openSettings,
      }
      return messages[key] ?? key
    },
  }),
}))

let tree: ReturnType<typeof TestRenderer.create>

afterEach(() => {
  TestRenderer.act(() => tree.unmount())
})

describe.each(['dark', 'light'] as const)('push device feedback in %s mode', (mode) => {
  const tokens = createTokensV2('orange', mode)

  it('uses muted text for a denied permission and opens settings', () => {
    const onOpenSettings = vi.fn()
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PushDevicesRow
        tokens={tokens} count={0} max={5} currentDeviceRegistered={false}
        supported loading={false} error={false} permissionStatus="denied" registrationStatus="idle"
        onToggle={vi.fn()} onOpenSettings={onOpenSettings} onRetry={vi.fn()}
      />)
    })
    const status = tree.root.findAllByType(Text).find(
      (node: { props: { children: string } }) => node.props.children === ptBr.settings.notifications.deniedNative,
    )!
    expect(StyleSheet.flatten(status.props.style).color).toBe(tokens.fg3)
    expect(status.props.accessibilityLiveRegion).toBe('polite')
    const action = tree.root.findAllByType(Pressable).find(
      (node: { props: { accessibilityRole?: string }; findAllByType: typeof tree.root.findAllByType }) =>
        node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(
          (text: { props: { children: string } }) => text.props.children === ptBr.settings.notifications.openSettings,
        ),
    )!
    expect(action).toBeDefined()
    TestRenderer.act(() => action.props.onPress())
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it.each([
    ['sync-failed', ptBr.settings.notifications.syncFailed],
    ['token-missing', ptBr.settings.notifications.tokenMissing],
  ] as const)('keeps %s feedback critical', (registrationStatus, message) => {
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PushDevicesRow
        tokens={tokens} count={0} max={5} currentDeviceRegistered={false}
        supported loading={false} error={false} permissionStatus="granted" registrationStatus={registrationStatus}
        onToggle={vi.fn()} onOpenSettings={vi.fn()} onRetry={vi.fn()}
      />)
    })
    const status = tree.root.findAllByType(Text).find(
      (node: { props: { children: string } }) => node.props.children === message,
    )!
    expect(StyleSheet.flatten(status.props.style).color).toBe(tokens.statusBadText)
    expect(status.props.accessibilityLiveRegion).toBe('polite')
    expect(tree.root.findAllByType(Text).some(
      (node: { props: { children: string } }) => node.props.children === ptBr.settings.notifications.openSettings,
    )).toBe(false)
  })
})
