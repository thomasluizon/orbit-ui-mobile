import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarBody } from '@/app/(tabs)/calendar/_components/calendar-body'
import { createTokensV2 } from '@/lib/theme'
import { press, renderNavigation } from '../components/ui/navigation-render'

const device = vi.hoisted(() => ({ online: true }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: device.online }) }))

const tokens = createTokensV2('purple', 'dark')
type Tree = ReturnType<typeof renderNavigation>
const texts = (tree: Tree) => tree.hosts().flatMap((node) => (typeof node.props.children === 'string' ? [node.props.children] : []))
const mascots = (tree: Tree) => tree.hosts().filter((node) => (node.props as Record<string, unknown>)['data-orbit-state'] !== undefined)
const retry = (tree: Tree) => tree.hosts().find((node) => node.props.accessibilityLabel === 'common.retry')!

function mount(failed: 'profile' | 'month', onRetry = vi.fn(), profileError: Error = new Error('profile unavailable')) {
  const profile = failed === 'profile'
  const tree = renderNavigation(<CalendarBody profileReady={!profile} profileError={profile ? profileError : null} onRetryProfile={profile ? onRetry : vi.fn()} error={profile ? null : 'month unavailable'} onRetry={profile ? vi.fn() : onRetry} tokens={tokens}><></></CalendarBody>)
  return { tree, onRetry }
}

afterEach(() => { device.online = true })

describe('Android Calendário load error', () => {
  it.each(['profile', 'month'] as const)('shows Orbit in Parado, one first person line and the retry for a %s failure, in the centred region', (failed) => {
    const { tree, onRetry } = mount(failed)
    expect(mascots(tree)).toHaveLength(1)
    expect((mascots(tree)[0]!.props as Record<string, unknown>)['data-orbit-state']).toBe('parado')
    expect(texts(tree)).toContain('calendar.orbit.loadError')
    expect(texts(tree)).not.toContain('calendar.loadError')
    expect(tree.hosts().some((node) => node.props.testID === 'shell-centred-region')).toBe(true)
    press(retry(tree))
    expect(onRetry).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('says the read needs a connection when the device is offline', () => {
    device.online = false
    const { tree } = mount('month')
    expect(texts(tree)).toContain('offline.description')
    expect(texts(tree)).not.toContain('calendar.orbit.loadError')
    expect((mascots(tree)[0]!.props as Record<string, unknown>)['data-orbit-state']).toBe('parado')
    tree.unmount()
  })

  it('says the read needs a connection when the profile read failed for want of one', () => {
    const { tree } = mount('profile', vi.fn(), new TypeError('Network request failed'))
    expect(texts(tree)).toContain('offline.description')
    tree.unmount()
  })

  it('holds the guided line in both locales', () => {
    expect(en.calendar.orbit.loadError).toBe('I could not load your calendar.')
    expect(ptBR.calendar.orbit.loadError).toBe('Não consegui carregar o seu calendário.')
    expect(en.calendar.loadError).toBe('Could not load the calendar. Please try again.')
  })
})
