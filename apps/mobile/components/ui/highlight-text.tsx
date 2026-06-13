import { useMemo } from 'react'
import { Text, type TextStyle } from 'react-native'
import { highlightText } from '@orbit/shared/utils'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HighlightTextProps {
  text: string
  query: string
  style?: TextStyle
}

export function HighlightText({ text, query, style }: Readonly<HighlightTextProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const segments = highlightText(text, query)

  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <Text
            key={`segment-${i}-${seg.text}`}
            style={{
              backgroundColor: tintFromPrimary(tokens, 0.18),
              color: tokens.fg1,
              borderRadius: 2,
              paddingHorizontal: 1,
            }}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={`segment-${i}-${seg.text}`}>{seg.text}</Text>
        ),
      )}
    </Text>
  )
}

