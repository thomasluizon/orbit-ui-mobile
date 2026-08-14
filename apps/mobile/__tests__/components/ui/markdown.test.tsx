import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { Markdown } from '@/components/ui/markdown'

const TestRenderer = require('react-test-renderer')

const openURL = vi.fn((_url: string) => Promise.resolve())
vi.mock('react-native', () => ({
  Linking: { openURL: (url: string) => openURL(url) },
  Text: 'Text',
}))

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

interface LinkElement {
  props: { onPress?: () => void }
}

interface CapturedRenderer {
  link(children: unknown, href: string): ReactElement & LinkElement
}

function resetCapturedMarkedProps(): void {
  markedProps.current = null
}

function renderMarkdown(props: Parameters<typeof Markdown>[0]): Record<string, unknown> {
  resetCapturedMarkedProps()
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

  it('paints every prose role on the primary fill with the on-primary foreground', () => {
    const props = renderMarkdown({ children: '# Heading', tone: 'onPrimary' })
    const styles = props.styles as {
      text: { color: string }
      h1: { color: string }
      link: { color: string }
    }
    expect(styles.text.color).toBe(styles.h1.color)
    expect(styles.link.color).toBe(styles.text.color)
  })

  it('keeps prose shrinkable and maps headings to the shared type roles', () => {
    const props = renderMarkdown({ children: '# Heading' })
    const styles = props.styles as {
      text: { flexShrink?: number }
      link: { flexShrink?: number }
      h1: { fontSize: number; fontFamily: string }
      h2: { fontSize: number }
      h3: { fontSize: number; fontFamily: string }
    }
    const flatListProps = props.flatListProps as { style?: { minWidth?: number } }

    expect(styles.text.flexShrink).toBe(1)
    expect(styles.link.flexShrink).toBe(1)
    expect(styles.h1).toMatchObject({ fontSize: 28, fontFamily: 'Rubik_500Medium' })
    expect(styles.h2.fontSize).toBe(22)
    expect(styles.h3).toMatchObject({ fontSize: 18, fontFamily: 'Rubik_400Regular' })
    expect(flatListProps.style?.minWidth).toBe(0)
  })
})
