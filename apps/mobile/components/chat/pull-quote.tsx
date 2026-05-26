import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface PullQuoteProps {
  /** Optional uppercase mono eyebrow above the body (e.g. "ASTRA · 09:30"). */
  eyebrow?: ReactNode
  children: ReactNode
  /** Body text italic. Defaults to true to match v8 Astra-attributed prose. */
  italic?: boolean
  /** Horizontal padding in px (default 20). */
  paddingX?: number
  /** Vertical padding in px (default 14). */
  paddingY?: number
}

/** v8 Astra-attributed pull-quote with a 2px primary left rule. */
export function PullQuote({
  eyebrow,
  children,
  italic = true,
  paddingX = 20,
  paddingY = 14,
}: Readonly<PullQuoteProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={{ paddingHorizontal: paddingX, paddingVertical: paddingY }}>
      <View style={styles.inner}>
        <View
          style={[
            styles.rule,
            { backgroundColor: tokens.primary },
          ]}
        />
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          style={[
            styles.body,
            {
              color: tokens.fg2,
              fontStyle: italic ? 'italic' : 'normal',
            },
          ]}
        >
          {children}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  inner: {
    position: 'relative',
    paddingLeft: 14,
  },
  rule: {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    borderRadius: 1,
  },
  eyebrow: {
    fontFamily: 'GeistMono',
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: 0.63,
    marginBottom: 6,
  },
  body: {
    fontFamily: 'Geist',
    fontSize: 15,
    lineHeight: 22,
  },
})
