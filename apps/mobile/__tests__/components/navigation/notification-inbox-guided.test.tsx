import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type ViewStyle } from 'react-native'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionDurations, motionPresets, resolveMotionPreset } from '@orbit/shared/theme'
import type { NotificationItem } from '@orbit/shared/types/notification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { apiClient } from '@/lib/api-client'
import { resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { useAppToastStore } from '@/stores/app-toast-store'
import { i18n } from '@/lib/i18n'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
type Node = import('react-test-renderer').ReactTestInstance
const translation = vi.hoisted(() => ({ t: (key: string, _values?: Record<string, unknown>) => key }))
const view = vi.hoisted(() => ({ reducedMotion: false, push: vi.fn() }))
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: translation.t }) }
})
vi.mock('expo-router', () => ({ useRouter: () => ({ push: view.push }), usePathname: () => '/notifications' }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('react-native-safe-area-context', async (original) => {
  const { View } = await import('react-native')
  return { ...await original<typeof import('react-native-safe-area-context')>(), SafeAreaView: View }
})
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
const offlineMocks = vi.hoisted(() => ({
  buildQueuedMutation: vi.fn((options) => ({ id: 'mutation-1', ...options })),
  createQueuedAck: vi.fn((id: string) => ({ queued: true, queuedMutationId: id })),
  isQueuedResult: vi.fn(() => false),
  queueOrExecute: vi.fn(({ execute }: { execute: () => Promise<unknown> }) => execute()),
}))
vi.mock('@/lib/offline-mutations', () => offlineMocks)
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => view.reducedMotion }))

let tree: import('react-test-renderer').ReactTestRenderer | undefined
let queryClient: QueryClient
let words: typeof en = en

/** What the server returns on the next read. The cache keeps what the surface shows now. */
function serve(items: NotificationItem[], failing = false) {
  vi.mocked(apiClient).mockImplementation((url: string) => {
    if (url !== API.notifications.list) return Promise.resolve(undefined)
    return failing ? Promise.reject(new Error('offline')) : Promise.resolve({ items, unreadCount: items.filter((item) => !item.isRead).length })
  })
}
function seed(items: NotificationItem[]) {
  queryClient.setQueryData(notificationKeys.lists(), { items, unreadCount: items.filter((item) => !item.isRead).length })
  serve(items)
}
function mount() {
  void TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={queryClient}><NotificationBell /><NotificationInbox /><NotificationDeleteNotice /></QueryClientProvider>) })
}
const hosts = (predicate: (node: Node) => boolean) => tree!.root.findAll((node) => typeof node.type === 'string' && predicate(node))
const byTestId = (testID: string) => hosts((node) => node.props.testID === testID)
const isText = (node: Node) => String(node.type) === 'Text'
const texts = () => hosts(isText).map((node) => renderedText(node.props.children))
const flat = (node: Node) => StyleSheet.flatten<ViewStyle & { transition?: string }>(node.props.style as ViewStyle)
const pressables = () => hosts((node) => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string')
const rowNames = () => pressables().map((node) => node.props.accessibilityLabel as string).filter((name) => /\. (read|unread|lido|não lido)/.test(name))
function press(label: string | RegExp) {
  const button = hosts((node) => typeof node.props.onPress === 'function' && (
    (typeof node.props.accessibilityLabel === 'string' && (typeof label === 'string' ? node.props.accessibilityLabel === label : label.test(node.props.accessibilityLabel)))
    || (typeof label === 'string' && node.findAll((child) => isText(child) && child.props.children === label).length > 0)
  ))[0]
  if (!button) throw new Error(`Missing control: ${String(label)}`)
  void TestRenderer.act(() => { (button.props.onPress as () => void)() })
}
async function advance(milliseconds: number) {
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}
const mascots = (within?: Node) => (within ?? tree!.root).findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
const three = () => [
  createMockNotification({ id: 'first', title: 'First', isRead: false }),
  createMockNotification({ id: 'second', title: 'Second', isRead: false }),
  createMockNotification({ id: 'third', title: 'Third', isRead: true }),
]
const SELECTION_EXIT = `opacity ${motionPresets.selection.exitDuration}ms cubic-bezier(${motionPresets.selection.exitEasing.join(',')})`
const bellLabel = () => hosts((node) => node.props.accessibilityRole === 'image' && typeof node.props.accessibilityLabel === 'string')[0]!.props.accessibilityLabel as string

async function useLocale(locale: 'en' | 'pt-BR') {
  await i18n.changeLanguage(locale)
  translation.t = i18n.t.bind(i18n)
  words = locale === 'en' ? en : ptBR
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  view.reducedMotion = false
  __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  resetPendingNotificationDeletesForTests()
  useAppToastStore.setState({ currentToast: null, queue: [] })
  await useLocale('en')
  focusManager.setFocused(true)
  await import('@/lib/query-client')
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  seed(three())
  offlineMocks.queueOrExecute.mockImplementation(({ execute }: { execute: () => Promise<unknown> }) => execute())
})

afterEach(() => {
  void TestRenderer.act(() => tree?.unmount())
  tree = undefined
  resetPendingNotificationDeletesForTests()
  useAppToastStore.setState({ currentToast: null, queue: [] })
  queryClient.clear()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

describe('the Android Avisos inbox with the guided flows off', () => {
  it('renders the current rows: no row motion, no settle layer and a dot only on an unread row', () => {
    mount()
    expect(rowNames()).toEqual(['First. unread', 'Second. unread', 'Third. read'])
    expect(byTestId('notification-row-motion')).toHaveLength(0)
    expect(hosts((node) => String(node.type) === 'LayoutAnimationConfig')).toHaveLength(0)
    expect(byTestId('notification-unread-surface')).toHaveLength(0)
    expect(byTestId('notification-unread-mark')).toHaveLength(0)
    expect(byTestId('notification-unread-dot')).toHaveLength(2)
  })

  it('renders the current failed state with no Orbit, and the count of the bell with no roll', async () => {
    queryClient.clear()
    serve([], true)
    mount()
    await advance(0)
    expect(texts()).toContain(en.notifications.loadError)
    expect(mascots(byTestId('notification-empty')[0])).toHaveLength(0)
    seed([createMockNotification({ id: 'one', isRead: false })])
    await advance(0)
    expect(byTestId('notification-count-roll')).toHaveLength(0)
  })
})

describe('the Android Avisos inbox on the Orbit logic', () => {
  beforeEach(() => enableTestFlags('orbit_guided_flows'))

  it.each([{ locale: 'en' as const, width: 412, size: 96 }, { locale: 'pt-BR' as const, width: 412, size: 96 }, { locale: 'pt-BR' as const, width: 1024, size: 128 }])(
    'shows the empty inbox as Orbit in Parado at $size with the current title in $locale, with no motion on arrival', async ({ locale, width, size }) => {
      await useLocale(locale)
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
      seed([])
      mount()
      const state = byTestId('notification-empty')[0]!
      expect(mascots(state)).toHaveLength(1)
      expect(mascots(state)[0]!.props['data-orbit-state']).toBe('parado')
      expect(mascots(state)[0]!.props.width).toBe(size)
      expect(state.findAll(isText).map((node) => renderedText(node.props.children))).toEqual([words.notifications.empty])
      expect(byTestId('notification-row-motion')).toHaveLength(0)
      expect(state.props.entering).toBeUndefined()
    })

  it('shows the failed inbox as Orbit in Parado with the current message, and retry reads the inbox again', async () => {
    await useLocale('pt-BR')
    queryClient.clear()
    serve([], true)
    mount()
    await advance(0)
    const state = byTestId('notification-empty')[0]!
    expect(mascots(state)[0]!.props['data-orbit-state']).toBe('parado')
    expect(mascots(state)[0]!.props.width).toBe(96)
    expect(state.findAll(isText).map((node) => renderedText(node.props.children))).toContain(ptBR.notifications.loadError)
    const reads = vi.mocked(apiClient).mock.calls.filter(([url]) => url === API.notifications.list).length
    serve(three())
    press(ptBR.common.retry)
    await advance(0)
    expect(vi.mocked(apiClient).mock.calls.filter(([url]) => url === API.notifications.list).length).toBe(reads + 1)
    expect(rowNames()).toHaveLength(3)
  })

  it('opens one detail for a double press on a row, with view, mark as read and delete', () => {
    seed([createMockNotification({ id: 'habit', title: 'Walk', isRead: false, url: '/habits/abc', habitId: 'abc' })])
    mount()
    press(/^Walk\./)
    press(/^Walk\./)
    expect(texts().filter((value) => value === en.notifications.markAsRead)).toHaveLength(1)
    expect(texts().filter((value) => value === en.notifications.delete)).toHaveLength(1)
    expect(texts().filter((value) => value.startsWith('Open in '))).toHaveLength(1)
  })

  it('settles the unread mark of the one row that is marked read with the selection exit, and moves no other row', async () => {
    mount()
    const marks = () => byTestId('notification-unread-mark')
    const surfaces = () => byTestId('notification-unread-surface')
    const before = marks().map((mark) => flat(mark))
    expect(marks().map((mark) => mark.props['data-unread'])).toEqual([true, true, false])
    serve(three().map((item) => (item.id === 'first' ? { ...item, isRead: true } : item)))
    press(/^First\./)
    press(en.notifications.markAsRead)
    await advance(0)
    expect(apiClient).toHaveBeenCalledWith(API.notifications.markRead('first'), expect.objectContaining({ method: 'PUT' }))
    expect(marks().map((mark) => mark.props['data-unread'])).toEqual([false, true, false])
    expect(flat(marks()[0]!)).toMatchObject({ opacity: 0, transition: SELECTION_EXIT })
    expect(flat(surfaces()[0]!)).toMatchObject({ opacity: 0, transition: SELECTION_EXIT })
    expect(marks().slice(1).map((mark) => flat(mark))).toEqual(before.slice(1))
    expect(rowNames()).toEqual(['First. read', 'Second. unread', 'Third. read'])
  })

  it('sends the same mark all read request as the current surface and settles every unread mark in one motion', async () => {
    const markAllCalls = () => ({
      requests: vi.mocked(apiClient).mock.calls.filter(([url]) => url === API.notifications.markAllRead).map(([url, options]) => [url, options?.method]),
      queued: offlineMocks.buildQueuedMutation.mock.calls.map(([mutation]) => mutation as unknown),
    })
    mount()
    serve(three().map((item) => ({ ...item, isRead: true })))
    press(en.notifications.options)
    press(en.notifications.markAllReadMenu)
    await advance(0)
    const guidedCalls = markAllCalls()
    const settled = byTestId('notification-unread-mark')
    expect(settled.map((mark) => mark.props['data-unread'])).toEqual([false, false, false])
    expect(new Set(settled.map((mark) => flat(mark).transition))).toEqual(new Set([SELECTION_EXIT]))
    expect(bellLabel()).toBe(en.notifications.bell)
    void TestRenderer.act(() => tree?.unmount())

    resetTestFlags()
    vi.mocked(apiClient).mockClear()
    offlineMocks.buildQueuedMutation.mockClear()
    queryClient.clear()
    seed(three())
    mount()
    serve(three().map((item) => ({ ...item, isRead: true })))
    press(en.notifications.options)
    press(en.notifications.markAllReadMenu)
    await advance(0)
    expect(guidedCalls.requests).toEqual([[API.notifications.markAllRead, 'PUT']])
    expect(guidedCalls.queued).toEqual([{ type: 'markAllNotificationsRead', scope: 'notifications', endpoint: API.notifications.markAllRead, method: 'PUT', payload: null, dedupeKey: 'notifications:mark-all-read' }])
    expect(markAllCalls()).toEqual(guidedCalls)
    expect(vi.mocked(apiClient).mock.calls.filter(([url]) => /\/read$/.test(url)).length).toBe(0)
  })

  it('gives a deleted row the list exit and the gap close, shows the notice, and undo returns the same row to the same place with the list enter', async () => {
    mount()
    const exit = resolveMotionPreset('list-exit')
    const enter = resolveMotionPreset('list-enter')
    const order = rowNames()
    const motionRows = () => byTestId('notification-row-motion')
    expect(motionRows()).toHaveLength(3)
    for (const row of motionRows()) {
      expect((row.props.exiting as { durationMs: number; definitions: Record<number, { transform: { translateY: number }[] }> }).durationMs).toBe(exit.exitDuration)
      expect((row.props.exiting as { definitions: Record<number, { transform: { translateY: number }[] }> }).definitions[100]!.transform).toEqual([{ translateY: exit.shift }])
      expect((row.props.entering as { durationMs: number }).durationMs).toBe(enter.enterDuration)
      expect(row.props.layout).toBeDefined()
    }
    const wrapper = hosts((node) => String(node.type) === 'LayoutAnimationConfig')[0]!
    expect(wrapper.props).toMatchObject({ skipEntering: true, skipExiting: true })
    const rowsBefore = byTestId('notification-rows')[0]
    press('Delete: Second')
    await advance(0)
    expect(rowNames()).toEqual(['First. unread', 'Third. read'])
    expect(texts()).toContain(en.notifications.deleteQueued)
    expect(byTestId('notification-rows')[0]).toBe(rowsBefore)
    expect(vi.mocked(apiClient).mock.calls.filter(([url]) => url === API.notifications.delete('second'))).toHaveLength(0)
    press(en.notifications.deleteUndo)
    expect(rowNames()).toEqual(order)
    expect(byTestId('notification-rows')[0]).toBe(rowsBefore)
    await advance(6000)
    expect(vi.mocked(apiClient).mock.calls.filter(([url]) => url === API.notifications.delete('second'))).toHaveLength(0)
  })

  it('mounts the rows again with no entrance and no exit when the inbox itself changes', async () => {
    mount()
    const rowsBefore = byTestId('notification-rows')[0]
    seed([createMockNotification({ id: 'new', title: 'New', isRead: false }), ...three()])
    await advance(0)
    expect(rowNames()).toEqual(['New. unread', 'First. unread', 'Second. unread', 'Third. read'])
    expect(byTestId('notification-rows')[0]).not.toBe(rowsBefore)
    expect(hosts((node) => String(node.type) === 'LayoutAnimationConfig')[0]!.props).toMatchObject({ skipEntering: true, skipExiting: true })
  })

  it('keeps the short still exit under reduced motion: no travel, no gap glide, and the unread settle is off', () => {
    view.reducedMotion = true
    mount()
    for (const row of byTestId('notification-row-motion')) {
      const exiting = row.props.exiting as { durationMs: number; definitions: Record<number, { transform: { translateY: number }[] }> }
      expect(exiting.durationMs).toBe(resolveMotionPreset('list-exit', true).exitDuration)
      expect(exiting.definitions[100]!.transform).toEqual([{ translateY: 0 }])
      expect(row.props.layout).toBeUndefined()
    }
    expect(byTestId('notification-unread-mark').map((mark) => flat(mark).transition)).toEqual(['none', 'none', 'none'])
    expect(byTestId('notification-unread-surface').map((surface) => flat(surface).transition)).toEqual(['none', 'none', 'none'])
  })

  it('shows the current message with retry when a delete fails', async () => {
    vi.mocked(apiClient).mockImplementation((url: string) => {
      if (url === API.notifications.delete('second')) return Promise.reject(new Error('Server error'))
      return Promise.resolve({ items: three(), unreadCount: 2 })
    })
    mount()
    press('Delete: Second')
    await advance(5000)
    await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve() })
    await advance(1)
    await advance(1)
    expect(texts()).toContain(en.notifications.deleteError)
    expect(rowNames()).toEqual(['First. unread', 'Second. unread', 'Third. read'])
    press(en.common.retry)
    await advance(5000)
    expect(vi.mocked(apiClient).mock.calls.filter(([url]) => url === API.notifications.delete('second'))).toHaveLength(2)
  })

  it.each(['en', 'pt-BR'] as const)('keeps the clear all confirm with its count sentence and no Orbit in %s, then shows the empty state and no result dialog', async (locale) => {
    await useLocale(locale)
    mount()
    press(words.notifications.options)
    press(words.notifications.deleteAll)
    expect(texts()).toContain(locale === 'en' ? 'All 3 alerts leave the list. There is no way to undo this.' : 'Os 3 avisos saem da lista. Não há como desfazer.')
    expect(mascots()).toHaveLength(0)
    serve([])
    const confirm = hosts((node) => node.props.testID === 'button-destructive-sm' && typeof node.props.onPress === 'function')[0]!
    void TestRenderer.act(() => { (confirm.props.onPress as () => void)() })
    await advance(0)
    expect(apiClient).toHaveBeenCalledWith(API.notifications.deleteAll, expect.objectContaining({ method: 'DELETE' }))
    expect(mascots(byTestId('notification-empty')[0])[0]!.props['data-orbit-state']).toBe('parado')
    expect(byTestId('notification-row-motion')).toHaveLength(0)
    expect(texts()).not.toContain(words.result.title)
    expect(byTestId('result-dialog')).toHaveLength(0)
  })

  it.each(['/social', '/public-profile/ana', '/u/ana'])('renders no notification that targets %s', (url) => {
    seed([createMockNotification({ id: 'retired', title: 'Retired', isRead: false, url }), createMockNotification({ id: 'kept', title: 'Kept', isRead: false })])
    mount()
    expect(rowNames()).toEqual(['Kept. unread'])
    expect(texts()).not.toContain('Retired')
    expect(bellLabel()).toBe('Alerts, 1 unread')
  })

  it('rolls the count of the bell once on the slow duration when it changes, keeps the count in the accessible name, and never rolls the first count', async () => {
    mount()
    expect(bellLabel()).toBe('Alerts, 2 unread')
    expect(byTestId('notification-count-roll')).toHaveLength(0)
    press('Delete: First')
    await advance(0)
    expect(bellLabel()).toBe('Alerts, 1 unread')
    expect(byTestId('notification-count-roll')).toHaveLength(1)
    expect(renderedText(byTestId('notification-count')[0]!.props.children)).toBe('1')
    expect(motionDurations.slow).toBe(280)
  })

  it('swaps the count of the bell with no roll under reduced motion', async () => {
    view.reducedMotion = true
    mount()
    press('Delete: First')
    await advance(0)
    expect(bellLabel()).toBe('Alerts, 1 unread')
    expect(byTestId('notification-count-roll')).toHaveLength(0)
    expect(renderedText(byTestId('notification-count')[0]!.props.children)).toBe('1')
  })
})
