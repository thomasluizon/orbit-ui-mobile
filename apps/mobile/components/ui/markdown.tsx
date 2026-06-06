import { useMemo, type ReactNode } from 'react'
import { Linking, Text, type TextStyle } from 'react-native'
import RNMarkdown, {
  Renderer,
  type MarkedStyles,
  type RendererInterface,
} from 'react-native-marked'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

type MarkdownTone = "default" | "muted" | "onPrimary"

interface MarkdownProps {
  children: string
  // default → fg1 (AI bubbles), muted → fg2 (descriptions), onPrimary →
  // fgOnPrimary (user bubbles on the primary background).
  tone?: MarkdownTone
}

function resolveColor(tokens: AppTokens, tone: MarkdownTone): string {
  if (tone === "muted") return tokens.fg2
  if (tone === "onPrimary") return tokens.fgOnPrimary
  return tokens.fg1
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

function createMarkedStyles(tokens: AppTokens, color: string): MarkedStyles {
  return {
    text: { color, fontSize: 14, lineHeight: 20 },
    paragraph: { marginVertical: 4 },
    strong: { color, fontWeight: '700' },
    em: { color, fontStyle: 'italic' },
    link: { color: tokens.primary, textDecorationLine: 'underline' },
    h1: { color, fontSize: 20, fontWeight: '700', marginVertical: 6 },
    h2: { color, fontSize: 18, fontWeight: '700', marginVertical: 6 },
    h3: { color, fontSize: 16, fontWeight: '600', marginVertical: 4 },
    list: { marginVertical: 4 },
    li: { color, fontSize: 14, lineHeight: 20 },
    codespan: {
      color,
      backgroundColor: tokens.bgSunk,
      fontFamily: 'monospace',
    },
    code: { backgroundColor: tokens.bgSunk, padding: 12, borderRadius: 8 },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: tokens.hairlineStrong,
      paddingLeft: 12,
    },
  }
}

/**
 * The single mobile markdown renderer for chat messages and habit/goal
 * descriptions. Wraps react-native-marked (same `marked` engine as web for
 * parsing parity), themes it with v8 tokens, and never opens unsafe link
 * schemes. Renders through RN core primitives only — no raw HTML, no native
 * module, so it is New-Architecture safe.
 */
export function Markdown({ children, tone = "default" }: Readonly<MarkdownProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const color = resolveColor(tokens, tone)
  const styles = useMemo(() => createMarkedStyles(tokens, color), [tokens, color])
  const renderer = useMemo(() => new SafeLinkRenderer(), [])

  return (
    <RNMarkdown
      value={children}
      styles={styles}
      renderer={renderer}
      theme={{
        colors: {
          text: color,
          link: tokens.primary,
          code: color,
          border: tokens.hairlineStrong,
        },
      }}
      flatListProps={{ scrollEnabled: false, initialNumToRender: 12 }}
    />
  )
}
