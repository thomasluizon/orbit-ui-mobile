import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { Text } from 'react-native'
import { Tokenizer } from 'marked'
import type { useMarkdownHookOptions } from 'react-native-marked'
import { Markdown } from '@/components/ui/markdown'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const TestRenderer = require('react-test-renderer')
const { default: useMarkdown } = await vi.importActual<{ default: typeof import('react-native-marked').useMarkdown }>('react-native-marked/src/hooks/useMarkdown')

const themeSelection = vi.hoisted((): { currentScheme: 'purple'; currentTheme: 'dark' | 'light' } => ({
  currentScheme: 'purple',
  currentTheme: 'dark',
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => themeSelection }))

const openURL = vi.fn((_url: string) => Promise.resolve())
vi.mock('react-native', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-native')>(),
  Linking: { openURL: (url: string) => openURL(url) },
  Text: 'Text',
  TouchableHighlight: 'TouchableHighlight',
}))

vi.mock('react-native-marked/src/components/MDImage', () => ({ default: 'Image' }))
vi.mock('react-native-marked/src/components/MDSvg', () => ({ default: 'Image' }))
vi.mock('react-native-marked/src/components/MDList', () => ({
  default: ({ li }: { li: ReactElement[] }) => <section>{li}</section>,
}))
vi.mock('react-native-marked/src/components/MDTable', () => ({ default: 'Table' }))

const markedProps: { current: Record<string, unknown> | null } = { current: null }
vi.mock('react-native-marked', async () => {
  const { default: Renderer } = await vi.importActual<{ default: typeof import('react-native-marked').Renderer }>('react-native-marked/src/lib/Renderer')
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      markedProps.current = props
      return null
    },
    Renderer,
    MarkedTokenizer: Tokenizer,
  }
})

interface NativeLinkProps {
  onPress?: () => void
  onPressIn?: () => void
  onPressOut?: () => void
  accessibilityRole?: string
  style: { color?: string; backgroundColor?: string; textDecorationLine?: string }[]
}

interface CapturedRenderer {
  link(children: unknown, href: string): ReactElement
}

function renderLink(element: ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return {
    get props(): NativeLinkProps { return tree.root.findAllByType('Text')[0].props },
    get nestedProps(): NativeLinkProps { return tree.root.findAllByType('Text')[1].props },
  }
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

function ParsedMarkdown({ content, options }: { content: string; options: useMarkdownHookOptions }) {
  return <>{useMarkdown(content, options)}</>
}

function renderParsedMarkdown(content: string) {
  const props = renderMarkdown({ children: content })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ParsedMarkdown content={content} options={props} />) })
  return tree
}

describe('mobile Markdown wrapper', () => {
  describe.each([false, true])('list image labels with linked=%s', (linked) => {
    it.each([false, true])('keeps list prose inline with nested=%s', (nested) => {
      const image = '![alt](image.png)'
      const content = `- before ${linked ? `[${image}](https://example.com/path)` : image} after${nested ? '\n  - nested' : ''}`
      const tree = renderParsedMarkdown(content)
      const item = tree.root.findAllByType('View')[0]
      const inline = item.children.filter((child: { type: unknown }) => child.type === 'Text')
      expect(inline, 'list item must have one inline text flow').toHaveLength(1)
      const leaves = inline[0].findAllByType('Text').flatMap((node: { children: unknown[] }) => node.children.filter((child) => typeof child === 'string'))
      expect(leaves.join('')).toBe('before alt after')
      expect(tree.root.findAllByType('Image')).toHaveLength(0)
      if (nested) {
        expect(item.children).toHaveLength(2)
        expect(inline[0].findAllByType('section')).toHaveLength(0)
        expect(item.findAllByType('section')).toHaveLength(1)
      }
      if (linked) {
        const link = inline[0].findAllByType('Text').find((node: { props: NativeLinkProps }) => node.props.accessibilityRole === 'link')
        link.props.onPress()
        expect(openURL).toHaveBeenCalledExactlyOnceWith('https://example.com/path')
      }
    })
  })

  describe.each([false, true])('inline image labels with linked=%s', (linked) => {
    it.each(['alt', 'first  \nsecond'])('keeps the label in one inline sentence: %s', (source) => {
      const image = `![${source}](image.png)`
      const content = `before ${linked ? `[${image}](https://example.com/path)` : image} after`
      const tree = renderParsedMarkdown(content)
      const paragraphs = tree.root.findAllByType('View')
      const paragraph = paragraphs[0]
      expect(paragraph.children, 'paragraph must have one inline text flow').toHaveLength(1)
      expect(paragraph.children[0].type).toBe('Text')
      const leaves = paragraph.findAllByType('Text').flatMap((node: { children: unknown[] }) => node.children.filter((child) => typeof child === 'string'))
      expect(leaves.join('')).toBe(`before ${source.replace('  \n', '\n')} after`)
      expect(tree.root.findAllByType('Image')).toHaveLength(0)
      if (linked) {
        const link = paragraph.findAllByType('Text').find((node: { props: NativeLinkProps }) => node.props.accessibilityRole === 'link')
        link.props.onPress()
        expect(openURL).toHaveBeenCalledExactlyOnceWith('https://example.com/path')
      }
    })
  })

  it.each([
    ['![outer ![](inner.png "inner title") after](outer.png)', 'outer inner title after'],
    ['![![](inner.png)](outer.png "outer title")', 'outer title'],
    ['![outer [inner][ref]](image.png)\n\n[ref]: https://example.com', 'outer inner'],
    ['![outer [inner][ref]][picture]\n\n[ref]: https://example.com\n[picture]: image.png', 'outer inner'],
    ['![](image.png "**literal**")', '**literal**'],
    ['[![](image.png "**literal**")](https://example.com/path)', '**literal**'],
  ])('preserves document context and literal titles: %s', (content, label) => {
    const tree = renderParsedMarkdown(content)
    const text = tree.root.findAllByType('Text').find((node: { children: unknown[] }) => node.children.every((child) => typeof child === 'string'))
    expect(text.children.join('')).toBe(label)
    expect(tree.root.findAllByType('Image')).toHaveLength(0)
    if (content.startsWith('[!')) {
      expect(text.props.accessibilityRole).toBe('link')
      text.props.onPress()
      expect(openURL).toHaveBeenCalledExactlyOnceWith('https://example.com/path')
    } else {
      expect(text.props.style).toMatchObject({ color: createTokensV2('purple', 'dark').fg2 })
      expect(openURL).not.toHaveBeenCalled()
    }
  })

  describe.each(['bare', 'linked'])('%s image labels', (context) => {
    it.each([
      ['**bold**', 'bold'],
      ['A &amp; B', 'A & B'],
      ['a \\* b', 'a * b'],
      ['**bold** <b title="&amp;">x</b>', 'bold <b title="&amp;">x</b>'],
      ['***nested*** ~~removed~~ `&amp;`', 'nested removed &amp;'],
      ['&#42;literal&#42; &amp;amp; &#x1F680; \\&amp;', '*literal* &amp; 🚀 &amp;'],
    ])('renders semantic plain text for %s', (source, label) => {
      const image = `![${source}](https://example.com/i.png)`
      const content = context === 'linked' ? `[${image}](https://example.com/path)` : image
      const tree = renderParsedMarkdown(content)
      const text = tree.root.findAllByType('Text').find((node: { children: unknown[] }) => node.children.every((child) => typeof child === 'string'))
      expect(text.children.join('')).toBe(label)
      expect(tree.root.findAllByType('Image')).toHaveLength(0)
      if (context === 'linked') {
        expect(text.props.accessibilityRole).toBe('link')
        text.props.onPress()
        expect(openURL).toHaveBeenCalledExactlyOnceWith('https://example.com/path')
      } else {
        expect(text.props.style).toMatchObject({ color: createTokensV2('purple', 'dark').fg2 })
        expect(openURL).not.toHaveBeenCalled()
      }
    })
  })

  beforeEach(() => {
    openURL.mockClear()
    themeSelection.currentTheme = 'dark'
  })

  it('blocks unsafe linked images before they can open a URL', () => {
    const tree = renderParsedMarkdown('[![alt](https://example.com/i.png)](javascript:alert(1))')
    const pressable = tree.root.findAll((node: { props: NativeLinkProps }) => typeof node.props.onPress === 'function')
    expect(pressable).toHaveLength(0)
    expect(tree.root.findAllByType('Text').some((node: { children: unknown[] }) => node.children.join('') === 'alt')).toBe(true)
    expect(tree.root.findAllByType('Image')).toHaveLength(0)
    expect(openURL).not.toHaveBeenCalled()
  })

  it('opens safe linked images through their accessible text label', () => {
    const tree = renderParsedMarkdown('[![alt](https://example.com/i.png)](https://example.com/path)')
    const link = tree.root.findAllByType('Text').find((node: { props: NativeLinkProps }) => node.props.accessibilityRole === 'link')
    expect(link).toBeDefined()
    expect(link.children.join('')).toBe('alt')
    expect(typeof link.props.onPress).toBe('function')
    link.props.onPress()
    expect(openURL).toHaveBeenCalledExactlyOnceWith('https://example.com/path')
    expect(tree.root.findAllByType('Image')).toHaveLength(0)
  })

  it.each([
    ['![alt](https://example.com/i.png)', 'alt'],
    ['![](https://example.com/i.png "title")', 'title'],
    ['![<b>alt</b>](https://example.com/i.png)', '<b>alt</b>'],
  ])('renders a bare image as themed text: %s', (content, label) => {
    const tree = renderParsedMarkdown(content)
    const text = tree.root.findAllByType('Text').find((node: { props: { children: unknown } }) => node.props.children === label)
    expect(text).toBeDefined()
    expect(text.props.style).toMatchObject({ color: createTokensV2('purple', 'dark').fg2 })
    expect(tree.root.findAllByType('Image')).toHaveLength(0)
    expect(openURL).not.toHaveBeenCalled()
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
      const link = renderLink(element)
      expect(typeof link.props.onPress).toBe('function')
      expect(link.props.accessibilityRole).toBe('link')
      link.props.onPress?.()
    }

    expect(openURL).toHaveBeenCalledTimes(3)
    expect(openURL).toHaveBeenCalledWith('https://orbit.app')
  })

  it('refuses to open javascript: and data: link schemes', () => {
    const props = renderMarkdown({ children: 'x' })
    const renderer = props.renderer as CapturedRenderer

    for (const href of ['javascript:alert(1)', 'data:text/html,<script>']) {
      const link = renderLink(renderer.link(['label'], href))
      expect(link.props.onPress).toBeUndefined()
      expect(link.props.onPressIn).toBeUndefined()
      expect(link.props.onPressOut).toBeUndefined()
      expect(link.props.accessibilityRole).toBeUndefined()
      const styles = props.styles as { text: { color: string } }
      expect(link.props.style.at(-1)).toMatchObject({ color: styles.text.color, textDecorationLine: 'none' })
    }
    expect(openURL).not.toHaveBeenCalled()
  })

  it('forces a transparent background on the rendered flat list', () => {
    const props = renderMarkdown({ children: 'x' })
    const flatListProps = props.flatListProps as { style?: { backgroundColor?: string } }
    expect(flatListProps.style?.backgroundColor).toBe('transparent')
  })

  it.each(['dark', 'light'] as const)('uses neutral underlined links on raised surfaces in %s mode', (mode) => {
    themeSelection.currentTheme = mode
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    for (const tone of ['default', 'muted'] as const) {
      const props = renderMarkdown({ children: 'x', tone })
      const styles = props.styles as { link: { color: string; textDecorationLine: string } }
      const theme = props.theme as { colors: { link: string } }
      expect(styles.link.color).toBe(tokens.fg1)
      expect(theme.colors.link).toBe(tokens.fg1)
      expect(styles.link.textDecorationLine).toBe('underline')
    }
  })

  it.each(['default', 'muted', 'onPrimary'] as const)('restores the link after pressing in %s prose, including nested text', (tone) => {
    const props = renderMarkdown({ children: 'x', tone })
    const renderer = props.renderer as CapturedRenderer
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    const styles = props.styles as { link: { color: string } }
    const link = renderLink(renderer.link([<Text key="bold" style={styles.link}>label</Text>], 'https://orbit.app'))
    const resting = link.props.style.at(-1)
    TestRenderer.act(() => { link.props.onPressIn?.() })
    expect(link.props.style.at(-1)).not.toEqual(resting)
    expect(link.props.style.at(-1)).toMatchObject(tone === 'onPrimary'
      ? { color: tokens.fgOnPrimary, backgroundColor: tokens.primaryPressed }
      : { color: tokens.fg2 })
    expect(link.nestedProps.style.at(-1)).toEqual(link.props.style.at(-1))
    TestRenderer.act(() => { link.props.onPressOut?.() })
    expect(link.props.style.at(-1)).toEqual(resting)
    expect(link.props.style.at(-1)?.textDecorationLine).toBe('underline')
    expect(openURL).not.toHaveBeenCalled()
  })

  it('renders nested text in a rejected link with the muted body treatment', () => {
    const props = renderMarkdown({ children: 'x', tone: 'muted' })
    const renderer = props.renderer as CapturedRenderer
    const styles = props.styles as { text: { color: string }; link: { color: string } }
    const link = renderLink(renderer.link([<Text key="bold" style={styles.link}>label</Text>], 'javascript:alert(1)'))
    expect(link.nestedProps.style.at(-1)).toMatchObject({ color: styles.text.color, textDecorationLine: 'none' })
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
    expect(styles.h1).toMatchObject({ fontSize: 28, fontFamily: 'Geist_500Medium' })
    expect(styles.h2.fontSize).toBe(22)
    expect(styles.h3).toMatchObject({ fontSize: 18, fontFamily: 'Geist_400Regular' })
    expect(flatListProps.style?.minWidth).toBe(0)
  })
})
