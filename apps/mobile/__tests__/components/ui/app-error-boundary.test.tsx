import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { AppState } from 'react-native'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { i18n } from '@/lib/i18n'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'

interface TestNode {
  props: { children?: unknown; onPress?: () => void; disabled?: boolean; accessibilityState?: unknown }
}
interface TestTree {
  root: { findAllByType: (type: string) => TestNode[]; findByType: (type: string) => TestNode }
  unmount: () => void
}
const { act, create }: { act: (callback: () => void | Promise<void>) => void | Promise<void>; create: (element: ReactElement) => TestTree } = require('react-test-renderer')
let tree: TestTree
async function mount(error: unknown, retry: () => void | Promise<void> = vi.fn()) {
  await act(() => { tree = create(<AppErrorScreen error={error} retry={retry} />) })
  return tree
}
function textContent() { return tree.root.findAllByType('Text').map((node) => node.props.children).join(' ') }
function button() { return tree.root.findByType('Pressable') }
afterEach(async () => { await act(() => tree.unmount()); vi.useRealTimers(); vi.restoreAllMocks() })

describe('AppErrorScreen', () => {
  it.each(['en', 'pt-BR'])('states the fix and exposes only a real reference in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    const messages = locale === 'en' ? en : pt
    const retry = vi.fn()
    await mount({ status: 500, data: { requestId: 'real-reference' } }, retry)
    expect(textContent()).toContain(messages.errorScreen.body)
    expect(textContent()).toContain('ref real-reference')
    await act(() => { button().props.onPress?.() })
    expect(retry).toHaveBeenCalledOnce()
  })
  it('keeps the retry busy until completion and hides internal errors', async () => {
    let finish = () => {}
    await mount(new Error('private detail'), () => new Promise<void>((resolve) => { finish = resolve }))
    void act(() => { button().props.onPress?.() })
    expect(button().props.accessibilityState).toEqual({ disabled: true, busy: true })
    expect(button().props.onPress).toBeUndefined()
    expect(textContent()).not.toContain('private detail')
    expect(textContent()).not.toContain('ref ')
    await act(() => { finish() })
    expect(button().props.disabled).toBe(false)
  })
  it.each(['en', 'pt-BR'])('recomputes the countdown on foreground and states no cause in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T00:00:00.000Z'))
    let foreground = () => {}
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      foreground = () => listener('active')
      return { remove: vi.fn() }
    })
    const retry = vi.fn()
    await mount({ status: 429, data: { error: 'Too many requests', requestId: 'real-reference', limit: 10, count: 11, retryAfterUtc: '2026-09-06T00:00:42.000Z' } }, retry)
    expect(textContent()).toContain('0:42')
    expect(button().props.disabled).toBe(true)
    await act(() => { button().props.onPress?.() })
    expect(retry).not.toHaveBeenCalled()
    vi.setSystemTime(new Date('2026-09-06T00:01:00.000Z'))
    await act(() => { foreground() })
    expect(textContent()).toContain('0:00')
    expect(textContent()).toContain((locale === 'en' ? en : pt).errorScreen.throttleBody)
    expect(textContent()).not.toMatch(/real-reference|policy|plan/i)
    await act(() => { button().props.onPress?.() })
    expect(retry).toHaveBeenCalledOnce()
  })
})
