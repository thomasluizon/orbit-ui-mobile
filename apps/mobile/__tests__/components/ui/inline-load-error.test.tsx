import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))

async function mount(onRetry = vi.fn()) {
  let tree!: ReturnType<typeof create>
  await act(() => { tree = create(<InlineLoadError message="Could not load habits." onRetry={onRetry} />) })
  return { tree, onRetry }
}

describe('InlineLoadError', () => {
  it('announces the message as an alert in the bad status text style with its font family', async () => {
    const { tree } = await mount()

    const alert = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityRole === 'alert')
    expect(alert).toHaveLength(1)
    expect(alert[0]!.props.children).toBe('Could not load habits.')
    expect(StyleSheet.flatten(alert[0]!.props.style)).toEqual({
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: createTokensV2('orange', 'dark').statusBadText,
    })
  })

  it('keeps the retry outside the alert and calls the retry once', async () => {
    const { tree, onRetry } = await mount()

    const retry = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'common.retry')
    expect(retry).toHaveLength(1)
    expect(retry[0]!.findAll((node) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
    await act(() => { (retry[0]!.props.onPress as () => void)() })
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
