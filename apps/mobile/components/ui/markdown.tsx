import { Children, cloneElement, isValidElement, useMemo, useState, type ElementType, type ReactNode } from 'react'
import { Linking, Text, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import RNMarkdown, {
  MarkedTokenizer,
  Renderer,
  type MarkedStyles,
  type RendererInterface,
} from 'react-native-marked'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { getMarkdownImageLabel } from '@orbit/shared/utils'

type AppTokens = ReturnType<typeof createTokensV2>

type MarkdownTone = "default" | "muted" | "thread"

interface MarkdownProps {
  children: string
  tone?: MarkdownTone
}

interface ProseColors {
  body: string
  heading: string
  link: string
  quote: string
  activeLink: TextStyle
}

function resolveProseColors(tokens: AppTokens, tone: MarkdownTone): ProseColors {
  if (tone === "muted")
    return { body: tokens.fg3, heading: tokens.fg2, link: tokens.fg1, quote: tokens.fg3, activeLink: { color: tokens.fg2 } }
  if (tone === "thread")
    return { body: tokens.fg1, heading: tokens.fg1, link: tokens.fg1, quote: tokens.fg3, activeLink: { color: tokens.fg2 } }
  return { body: tokens.fg2, heading: tokens.fg1, link: tokens.fg1, quote: tokens.fg3, activeLink: { color: tokens.fg2 } }
}

const SAFE_LINK_SCHEME = /^(https?:|mailto:)/i

function styleTextDescendants(children: ReactNode, style: TextStyle, preserved?: ElementType): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ style?: StyleProp<TextStyle>; children?: ReactNode }>(child)) return child
    if (preserved && child.type === preserved) return child
    return cloneElement(child, {
      ...(child.type === Text ? { style: [child.props.style, style] } : {}),
      children: styleTextDescendants(child.props.children, style, preserved),
    })
  })
}

function StrongText({ children, style }: Readonly<{ children: ReactNode; style?: TextStyle }>) {
  return <Text selectable style={style}>{children}</Text>
}

function ProseLink({ children, href, styles, colors }: Readonly<{
  children: ReactNode
  href: string
  styles?: TextStyle
  colors: ProseColors
}>) {
  const [pressed, setPressed] = useState(false)
  const safe = SAFE_LINK_SCHEME.test(href.trim())
  const style: TextStyle = safe
    ? { color: colors.link, textDecorationLine: 'underline', ...(pressed ? colors.activeLink : {}) }
    : { color: colors.body, textDecorationLine: 'none' }
  return (
    <Text
      selectable
      accessibilityRole={safe ? 'link' : undefined}
      style={[styles, style]}
      onPress={safe ? () => { void Linking.openURL(href) } : undefined}
      onPressIn={safe ? () => setPressed(true) : undefined}
      onPressOut={safe ? () => setPressed(false) : undefined}
    >
      {styleTextDescendants(children, style)}
    </Text>
  )
}

class ImageLabelTokenizer extends MarkedTokenizer {
  override link(...args: Parameters<MarkedTokenizer['link']>): ReturnType<MarkedTokenizer['link']> {
    const token = super.link(...args)
    if (token?.type === 'image') token.text = getMarkdownImageLabel(token)
    return token
  }

  override reflink(...args: Parameters<MarkedTokenizer['reflink']>): ReturnType<MarkedTokenizer['reflink']> {
    const token = super.reflink(...args)
    if (token?.type === 'image') token.text = getMarkdownImageLabel(token)
    return token
  }
}

class SafeLinkRenderer extends Renderer implements RendererInterface {
  constructor(private readonly colors: ProseColors, private readonly textStyles?: TextStyle) {
    super()
  }

  override paragraph(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return super.paragraph([this.text(children, this.textStyles)], styles)
  }

  override blockquote(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return super.blockquote([styleTextDescendants(children, { color: this.colors.quote }, StrongText)], styles)
  }

  override strong(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return <StrongText key={this.getKey()} style={styles}>{children}</StrongText>
  }

  override listItem(children: ReactNode[], styles?: ViewStyle): ReactNode {
    const blocks: ReactNode[] = []
    let inline: ReactNode[] = []
    const flush = () => {
      if (inline.length > 0) blocks.push(this.text(inline, this.textStyles))
      inline = []
    }
    for (const child of children) {
      if (isValidElement(child) && (child.type === Text || child.type === ProseLink)) {
        inline.push(child)
      } else {
        flush()
        blocks.push(child)
      }
    }
    flush()
    return super.listItem(blocks, styles)
  }

  override link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
  ): ReactNode {
    return (
      <ProseLink
        key={this.getKey()}
        href={href}
        styles={styles}
        colors={this.colors}
      >
        {children}
      </ProseLink>
    )
  }

  override image(_uri: string, alt?: string, _style?: ImageStyle, title?: string): ReactNode {
    return <Text selectable key={this.getKey()} style={this.textStyles}>{alt ?? title ?? ''}</Text>
  }

  override linkImage(href: string, _imageUrl: string, alt?: string, _style?: ImageStyle, title?: string | null): ReactNode {
    return this.link(alt ?? title ?? '', href, this.textStyles)
  }
}

function createMarkedStyles(tokens: AppTokens, colors: ProseColors, tone: MarkdownTone): MarkedStyles {
  const { body, heading, link } = colors
  const thread = tone === 'thread'
  return {
    text: {
      color: body,
      fontFamily: 'Geist_400Regular',
      fontSize: thread ? 16 : 14,
      lineHeight: thread ? 24 : 20,
      flexShrink: 1,
    },
    paragraph: thread ? { marginVertical: 0, paddingVertical: 0 } : { marginVertical: 4 },
    strong: { color: heading, fontFamily: 'Geist_500Medium' },
    em: { color: body, fontStyle: 'italic' },
    link: { color: link, textDecorationLine: 'underline', flexShrink: 1 },
    h1: {
      color: heading,
      fontFamily: 'Geist_500Medium',
      fontSize: 28,
      marginVertical: 6,
    },
    h2: {
      color: heading,
      fontFamily: 'Geist_500Medium',
      fontSize: 22,
      marginVertical: 6,
    },
    h3: {
      color: heading,
      fontFamily: 'Geist_400Regular',
      fontSize: 17,
      marginVertical: 4,
    },
    list: { marginVertical: 4 },
    li: {
      color: body,
      fontFamily: 'Geist_400Regular',
      fontSize: thread ? 16 : 14,
      lineHeight: thread ? 24 : 20,
      flexShrink: 1,
    },
    codespan: {
      color: body,
      backgroundColor: tokens.bgElev,
      borderRadius: radius.sm,
      fontFamily: 'GeistMono_400Regular',
    },
    code: {
      backgroundColor: tokens.bgElev,
      padding: 12,
      borderRadius: radius.sm,
    },
    blockquote: {
      borderLeftWidth: 2,
      borderLeftColor: tokens.hairline,
      paddingLeft: 12,
    },
  }
}

/**
 * The single mobile markdown renderer for chat messages and habit/goal descriptions. Wraps
 * react-native-marked (same `marked` engine as web for parsing parity), themes it with the
 * current theme tokens, and never opens unsafe link schemes.
 */
export function Markdown({ children, tone = "default" }: Readonly<MarkdownProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const colors = useMemo(() => resolveProseColors(tokens, tone), [tokens, tone])
  const styles = useMemo(
    () => createMarkedStyles(tokens, colors, tone),
    [tokens, colors, tone],
  )
  const renderer = useMemo(() => new SafeLinkRenderer(colors, styles.text), [colors, styles.text])
  const tokenizer = useMemo(() => new ImageLabelTokenizer(), [])

  return (
    <RNMarkdown
      value={children}
      styles={styles}
      renderer={renderer}
      tokenizer={tokenizer}
      theme={{
        colors: {
          text: colors.body,
          link: colors.link,
          code: colors.body,
          border: tokens.hairline,
        },
      }}
      flatListProps={{
        scrollEnabled: false,
        initialNumToRender: 12,
        ItemSeparatorComponent: tone === 'thread' ? () => <View style={{ height: 12 }} /> : undefined,
        style: { backgroundColor: 'transparent', minWidth: 0 },
      }}
    />
  )
}
