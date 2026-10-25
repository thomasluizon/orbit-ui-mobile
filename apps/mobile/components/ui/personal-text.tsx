import { useState, type Ref } from 'react'
import { ScrollView, StyleSheet, Text, View, type TextProps } from 'react-native'

type PersonalTextProps = Omit<TextProps, 'children'> & {
  children: string
  lines?: 1 | 2
  expanded?: boolean
  unclamped?: boolean
  onClampedChange?: (clamped: boolean) => void
  accessibilityRef?: Ref<View>
}

function wordLines(text: string, measuredLines: readonly string[]) {
  const boundaries = new Set<number>([0, text.length])
  let offset = 0
  for (const line of measuredLines.slice(0, -1)) {
    offset += line.length
    let boundary = offset
    while (boundary > 0 && !/\s/u.test(text[boundary - 1] ?? '') && !/\s/u.test(text[boundary] ?? '')) boundary--
    if (boundary > 0) boundaries.add(boundary)
    if (boundary < offset) {
      let wordEnd = offset
      while (wordEnd < text.length && !/\s/u.test(text[wordEnd] ?? '')) wordEnd++
      boundaries.add(wordEnd)
    }
  }
  const sorted = [...boundaries].sort((first, second) => first - second)
  return sorted.slice(1).map((end, index) => text.slice(sorted[index], end).trim()).filter(Boolean)
}

export function PersonalText({ children, lines: lineLimit = 2, expanded = false, unclamped = false, onClampedChange, accessibilityRef, style, ...props }: Readonly<PersonalTextProps>) {
  const [measurement, setMeasurement] = useState<{ text: string; lines: string[] }>()
  const expandedStyle = StyleSheet.flatten(style ?? {})
  const singleToken = !/\s/u.test(children.trim())
  const lines = measurement?.text === children ? measurement.lines : [children]
  const minimumLineHeight = (expandedStyle.fontSize ?? 14) * 1.4
  const visibleStyle = expanded || unclamped || lines.length >= 2 ? [style, { lineHeight: unclamped || lines.length >= 2 ? Math.max(expandedStyle.lineHeight ?? 0, minimumLineHeight) : expandedStyle.lineHeight ?? minimumLineHeight }] : style
  const visibleLines = expanded || unclamped ? lines : lines.length > 1 ? [lines[0], lines.slice(1).join(' ')] : lines
  const measure: TextProps['onTextLayout'] = (event) => {
    const nativeLines = event.nativeEvent.lines.map((line) => line.text)
    const nextLines = wordLines(children, nativeLines)
    let offset = 0
    const splitWord = nativeLines.slice(0, -1).some((line) => {
      offset += line.length
      return !/\s/u.test(children[offset - 1] ?? '') && !/\s/u.test(children[offset] ?? '')
    })
    onClampedChange?.(nativeLines.length > (singleToken ? 1 : lineLimit) || nextLines.length > lineLimit || splitWord)
    setMeasurement((current) => current?.text === children && current.lines.join('\n') === nextLines.join('\n') ? current : { text: children, lines: nextLines })
  }
  if ((singleToken || lineLimit === 1) && !expanded && onClampedChange) return <View ref={accessibilityRef} accessible accessibilityRole={props.accessibilityRole} accessibilityLabel={props.accessibilityLabel ?? children} style={styles.container}>
    <Text accessible={false} importantForAccessibility="no-hide-descendants" style={[style, styles.measurement]} onTextLayout={measure} textBreakStrategy="simple" android_hyphenationFrequency="none">{children}</Text>
    <Text accessibilityLabel={children} {...props} accessible={false} style={style} numberOfLines={1} ellipsizeMode="tail">{children}</Text>
  </View>
  if ((singleToken || lineLimit === 1) && !expanded) return <Text accessibilityLabel={children} {...props} style={style} numberOfLines={1} ellipsizeMode="tail">{children}</Text>
  return <View ref={accessibilityRef} testID={props.testID} style={styles.container} accessible accessibilityRole={props.accessibilityRole} accessibilityLanguage={props.accessibilityLanguage} accessibilityHint={props.accessibilityHint} accessibilityLabel={props.accessibilityLabel ?? children}>
    {!singleToken ? <Text {...props} accessible={false} importantForAccessibility="no-hide-descendants" style={[style, styles.measurement]} numberOfLines={undefined} ellipsizeMode="clip" textBreakStrategy="simple" android_hyphenationFrequency="none" onTextLayout={measure}>{children}</Text> : null}
    {visibleLines.map((line, index) => expanded
      ? <ScrollView key={index} horizontal><Text {...props} accessible={false} style={visibleStyle} numberOfLines={1}>{line}</Text></ScrollView>
      : <Text {...props} key={index} accessible={false} style={visibleStyle} numberOfLines={1} ellipsizeMode="tail">{line}</Text>)}
  </View>
}

const styles = StyleSheet.create({
  container: { minWidth: 0, width: '100%' },
  measurement: { position: 'absolute', width: '100%', opacity: 0, pointerEvents: 'none' },
})
