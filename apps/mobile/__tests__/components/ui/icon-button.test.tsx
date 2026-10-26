import { describe, expect, it, vi } from 'vitest'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
const renderer = require('react-test-renderer')

describe('IconButton', () => {
  it.each(['Refresh', 'Atualizar'])('keeps one named target with hover, press and busy feedback: %s', (label) => {
    const onClick = vi.fn()
    let tree: any
    renderer.act(() => { tree = renderer.create(<IconButton label={label} onClick={onClick}><RefreshCw /></IconButton>) })
    try {
      const button = tree.root.findByType('Pressable')
      const paint = (pressed = false) => Object.assign({}, ...button.props.style({ pressed }).flat().filter(Boolean))
      expect(button.props.accessibilityLabel).toBe(label)
      expect(tree.root.findAllByType('Text')).toHaveLength(0)
      expect(paint()).toMatchObject({ width: 44, height: 44, borderWidth: 0 })
      expect(Math.min(paint().borderRadius, paint().width / 2, paint().height / 2)).toBe(22)
      expect(button.props.hitSlop).toBe(2)
      expect(paint().width + 2 * button.props.hitSlop).toBe(48)
      expect(paint().height + 2 * button.props.hitSlop).toBe(48)
      renderer.act(() => button.props.onPress())
      expect(onClick).toHaveBeenCalledOnce()
      renderer.act(() => button.props.onHoverIn())
      expect(paint().backgroundColor).toBe(createTokensV2('orange', 'dark').bgHover)
      expect(paint(true).backgroundColor).toBe(paint().backgroundColor)
      renderer.act(() => tree.update(<IconButton label={label} onClick={onClick} loading><RefreshCw /></IconButton>))
      expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
      expect(button.props.onPress).toBeUndefined()
      expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1)
    } finally {
      renderer.act(() => tree.unmount())
    }
  })
})
