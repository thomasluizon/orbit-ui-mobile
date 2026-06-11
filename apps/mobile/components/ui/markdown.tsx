import { useMemo, type ReactNode } from 'react'
import { Linking, Text, type TextStyle } from 'react-native'
import RNMarkdown, {
  Renderer,
  type MarkedStyles,
  type RendererInterface,
} from 'react-native-marked'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

type MarkdownTone = "default" | "muted" | "onPrimary"

interface MarkdownProps {
  children: string
  tone?: MarkdownTone
}

interface ProseColors {
  body: string
  heading: string
}

function resolveProseColors(tokens: AppTokens, tone: MarkdownTone): ProseColors {
  if (tone === "muted") return { body: tokens.fg3, heading: tokens.fg2 }
  if (tone === "onPrimary")
    return { body: tokens.fgOnPrimary, heading: tokens.fgOnPrimary }
  return { body: tokens.fg2, heading: tokens.fg1 }
}

const SAFE_LINK_SCHEME = /^(https?:|mailto:)/i

/**
 * Renderer that gates link presses to http(s)/mailto. The library's default
 * link handler passes the raw href straight to Linking.openURL, which would
 * happily attempt javascript:/data: URLs — so we reject anything else.
 */
class SafeLinkRenderer extends Renderer implements RendererInterface {
  override link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
  ): ReactNode {
    const safe = SAFE_LINK_SCHEME.test(href.trim())
    return (
      <Text
        key={this.getKey()}
        selectable
        accessibilityRole="link"
        style={styles}
        onPress={
          safe
            ? () => {
                void Linking.openURL(href)
              }
            : undefined
        }
      >
        {children}
      </Text>
    )
  }
}

function createMarkedStyles(tokens: AppTokens, colors: ProseColors): MarkedStyles {
  const { body, heading } = colors
  return {
    text: { color: body, fontFamily: 'Rubik_400Regular', fontSize: 14, lineHeight: 20 },
    paragraph: { marginVertical: 4 },
    strong: { color: heading, fontFamily: 'Rubik_500Medium' },
    em: { color: body, fontStyle: 'italic' },
    link: { color: tokens.primary, textDecorationLine: 'underline' },
    h1: {
      color: heading,
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 20,
      marginVertical: 6,
    },
    h2: {
      color: heading,
      fontFamily: 'Rubik_500Medium',
      fontSize: 18,
      marginVertical: 6,
    },
    h3: {
      color: heading,
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      marginVertical: 4,
    },
    list: { marginVertical: 4 },
    li: { color: body, fontFamily: 'Rubik_400Regular', fontSize: 14, lineHeight: 20 },
    codespan: {
      color: body,
      backgroundColor: tokens.bgElev,
      borderRadius: radius.sm,
      fontFamily: 'Roboto_400Regular',
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
  const renderer = useMemo(() => new SafeLinkRenderer(), [])

  return (
    <RNMarkdown
      value={children}
      styles={styles}
      renderer={renderer}
      theme={{
        colors: {
          text: colors.body,
          link: tokens.primary,
          code: colors.body,
          border: tokens.hairline,
        },
      }}
      flatListProps={{
        scrollEnabled: false,
        initialNumToRender: 12,
        style: { backgroundColor: 'transparent' },
      }}
    />
  )
}
