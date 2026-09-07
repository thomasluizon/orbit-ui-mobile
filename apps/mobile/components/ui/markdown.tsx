import { Children, cloneElement, isValidElement, useMemo, useState, type ReactNode } from 'react'
import { Linking, Text, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
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

type MarkdownTone = "default" | "muted" | "onPrimary"

interface MarkdownProps {
  children: string
  tone?: MarkdownTone
}

interface ProseColors {
  body: string
  heading: string
  link: string
  activeLink: TextStyle
}

function resolveProseColors(tokens: AppTokens, tone: MarkdownTone): ProseColors {
  if (tone === "muted")
    return { body: tokens.fg3, heading: tokens.fg2, link: tokens.fg1, activeLink: { color: tokens.fg2 } }
  if (tone === "onPrimary")
    return {
      body: tokens.fgOnPrimary,
      heading: tokens.fgOnPrimary,
      link: tokens.fgOnPrimary,
      activeLink: { color: tokens.fgOnPrimary, backgroundColor: tokens.primaryPressed },
    }
  return { body: tokens.fg2, heading: tokens.fg1, link: tokens.fg1, activeLink: { color: tokens.fg2 } }
}

const SAFE_LINK_SCHEME = /^(https?:|mailto:)/i

function styleLinkChildren(children: ReactNode, style: TextStyle): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ style?: StyleProp<TextStyle>; children?: ReactNode }>(child)) return child
    return cloneElement(child, {
      ...(child.type === Text ? { style: [child.props.style, style] } : {}),
      children: styleLinkChildren(child.props.children, style),
    })
  })
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
      {styleLinkChildren(children, style)}
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

function createMarkedStyles(tokens: AppTokens, colors: ProseColors): MarkedStyles {
  const { body, heading, link } = colors
  return {
    text: {
      color: body,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      flexShrink: 1,
    },
    paragraph: { marginVertical: 4 },
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
      fontSize: 18,
      marginVertical: 4,
    },
    list: { marginVertical: 4 },
    li: {
      color: body,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
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
 * The single mobile markdown renderer for chat messages and habit/goal
 * descriptions. Wraps react-native-marked (same `marked` engine as web for
 * parsing parity), themes it with the navy+violet tokens, and never opens
 * unsafe link schemes. Renders through RN core primitives only — no raw HTML,
 * no native module, so it is New-Architecture safe.
 */
export function Markdown({ children, tone = "default" }: Readonly<MarkdownProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const colors = useMemo(() => resolveProseColors(tokens, tone), [tokens, tone])
  const styles = useMemo(
    () => createMarkedStyles(tokens, colors),
    [tokens, colors],
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
        style: { backgroundColor: 'transparent', minWidth: 0 },
      }}
    />
  )
}
