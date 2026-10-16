import React from 'react'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DescriptionCopyButton } from '@/components/habits/description-copy-button'

const clipboard = vi.hoisted(() => ({ setString: vi.fn(), getString: vi.fn() }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: clipboard }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
let tree: ReactTestRenderer
const description = '  **Original**\n\n' + 'A complete note. '.repeat(100)
const button = () => tree.root.findAll((node) => node.type === Pressable)[0]!
const press = () => {
  const onPress = button().props.onPress
  if (typeof onPress !== 'function') throw new Error('Copy action is unavailable')
  onPress()
}
const feedback = () => tree.root.findAll((node) => node.props.accessibilityLiveRegion === 'polite')[0]!
async function mount(text = description) {
  await act(() => { tree = create(<DescriptionCopyButton description={text} />) })
}
beforeEach(() => {
  clipboard.setString.mockReset()
  clipboard.getString.mockReset().mockResolvedValue(description)
})
afterEach(async () => { await act(() => { tree.update(<></>) }) })

describe('description copy action', () => {
  it('keeps the pressed well distinct from its opaque resting fill', async () => {
    await mount()
    const style = button().props.style as (state: { pressed: boolean }) => StyleProp<ViewStyle>
    const resting = StyleSheet.flatten(style({ pressed: false }))
    const pressed = StyleSheet.flatten(style({ pressed: true }))
    const tokens = createTokensV2('orange', 'dark')
    expect(contrastOnSurface(String(resting.backgroundColor), [tokens.bg, String(pressed.backgroundColor)])).toBeGreaterThanOrEqual(1.25)
    expect(contrastOnSurface(tokens.fg2, [tokens.bg, String(pressed.backgroundColor)])).toBeGreaterThanOrEqual(4.5)
  })

  it('copies the full original text and verifies it before announcing success', async () => {
    await mount()
    expect(feedback().props.children).toBe('')
    await act(async () => { press(); await Promise.resolve() })
    expect(clipboard.setString).toHaveBeenCalledWith(description)
    expect(clipboard.getString).toHaveBeenCalledTimes(1)
    expect(feedback().props.children).toBe('habits.detail.descriptionCopied')
  })

  it.each(['throw', 'rejection', 'mismatch'])('surfaces %s without claiming success and allows retry', async (failure) => {
    if (failure === 'throw') clipboard.setString.mockImplementation(() => { throw new Error('denied') })
    else if (failure === 'rejection') clipboard.getString.mockRejectedValue(new Error('denied'))
    else clipboard.getString.mockResolvedValue('Previous clipboard text')
    await mount()
    await act(async () => { press(); await Promise.resolve() })
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
    expect(feedback().props.children).toBe('habits.detail.copyFailed')
    clipboard.setString.mockReset()
    clipboard.getString.mockResolvedValue(description)
    await act(async () => { press(); await Promise.resolve() })
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
    expect(feedback().props.children).toBe('habits.detail.descriptionCopied')
  })

  it('disables empty descriptions and blocks their handler', async () => {
    await mount(' \n ')
    expect(button().props.disabled).toBe(true)
    expect(button().props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => { press(); await Promise.resolve() })
    expect(clipboard.setString).not.toHaveBeenCalled()
  })

  it('disables repeat activation until verification finishes', async () => {
    let finish!: (text: string) => void
    clipboard.getString.mockReturnValue(new Promise<string>((resolve) => { finish = resolve }))
    await mount()
    await act(async () => { press(); await Promise.resolve() })
    expect(button().props.disabled).toBe(true)
    expect(button().props.accessibilityState).toMatchObject({ busy: true })
    await act(async () => { press(); await Promise.resolve() })
    expect(clipboard.setString).toHaveBeenCalledTimes(1)
    expect(feedback().props.children).toBe('')
    await act(async () => { finish(description); await Promise.resolve() })
    expect(button().props.disabled).toBe(false)
    expect(feedback().props.children).toBe('habits.detail.descriptionCopied')
  })
})
