import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const TestRenderer = require('react-test-renderer')

const openURL = vi.fn((_url: string) => Promise.resolve())
vi.mock('react-native', () => ({
  Linking: { openURL: (url: string) => openURL(url) },
  Text: 'Text',
}))

// Capture the props the Markdown wrapper passes into react-native-marked so we
// can assert theming + exercise the safe-link renderer it provides.
const markedProps: { current: Record<string, unknown> | null } = { current: null }
vi.mock('react-native-marked', () => {
  class Renderer {
    getKey() {
      return 'k'
    }
  }
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      markedProps.current = props
      return null
    },
    Renderer,
  }
})

import { Markdown } from '@/components/ui/markdown'

interface LinkElement {
  props: { onPress?: () => void }
}

interface CapturedRenderer {
  link(children: unknown, href: string): ReactElement & LinkElement
}

function renderMarkdown(props: Parameters<typeof Markdown>[0]): Record<string, unknown> {
  markedProps.current = null
  TestRenderer.act(() => {
    TestRenderer.create(<Markdown {...props} />)
  })
  if (!markedProps.current) throw new Error('Markdown did not render react-native-marked')
  return markedProps.current
}

describe('mobile Markdown wrapper', () => {
  beforeEach(() => {
    openURL.mockClear()
  })

  it('passes the content through as the markdown value', () => {
    const props = renderMarkdown({ children: '# Hello' })
    expect(props.value).toBe('# Hello')
  })

  it('opens http(s) and mailto links', () => {
    const props = renderMarkdown({ children: 'x' })
    const renderer = props.renderer as CapturedRenderer

    for (const href of ['https://orbit.app', 'http://x', 'mailto:a@b.com']) {
      const element = renderer.link(['label'], href)
      expect(isValidElement(element)).toBe(true)
      expect(typeof element.props.onPress).toBe('function')
      element.props.onPress?.()
    }

    expect(openURL).toHaveBeenCalledTimes(3)
    expect(openURL).toHaveBeenCalledWith('https://orbit.app')
  })

  it('refuses to open javascript: and data: link schemes', () => {
    const props = renderMarkdown({ children: 'x' })
    const renderer = props.renderer as CapturedRenderer

    for (const href of ['javascript:alert(1)', 'data:text/html,<script>']) {
      const element = renderer.link(['label'], href)
      // unsafe links render as plain text with no press handler
      expect(element.props.onPress).toBeUndefined()
    }
    expect(openURL).not.toHaveBeenCalled()
  })

  it('forces a transparent background on the rendered flat list', () => {
    const props = renderMarkdown({ children: 'x' })
    const flatListProps = props.flatListProps as { style?: { backgroundColor?: string } }
    expect(flatListProps.style?.backgroundColor).toBe('transparent')
  })

  it('themes text with a different color for muted descriptions', () => {
    const defaultProps = renderMarkdown({ children: 'x' })
    const mutedProps = renderMarkdown({ children: 'x', tone: 'muted' })
    const defaultStyles = defaultProps.styles as { text: { color: string } }
    const mutedStyles = mutedProps.styles as { text: { color: string } }
    expect(defaultStyles.text.color).not.toBe(mutedStyles.text.color)
  })
})
