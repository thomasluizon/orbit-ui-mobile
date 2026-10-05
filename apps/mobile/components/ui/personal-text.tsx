import { useState, type Ref } from 'react'
import { ScrollView, StyleSheet, Text, View, type TextProps } from 'react-native'

type PersonalTextProps = Omit<TextProps, 'children'> & {
  children: string
  expanded?: boolean
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
  }
  const sorted = [...boundaries].sort((first, second) => first - second)
  return sorted.slice(1).map((end, index) => text.slice(sorted[index], end).trim()).filter(Boolean)
}

export function PersonalText({ children, expanded = false, accessibilityRef, style, ...props }: Readonly<PersonalTextProps>) {
  const [measurement, setMeasurement] = useState<{ text: string; lines: string[] }>()
  const expandedStyle = StyleSheet.flatten(style ?? {})
  const visibleStyle = expanded ? [style, { lineHeight: Math.max(expandedStyle.lineHeight ?? 0, (expandedStyle.fontSize ?? 14) * 1.4) }] : style
  const singleToken = !/\s/u.test(children.trim())
  const lines = measurement?.text === children ? measurement.lines : [children]
  const visibleLines = expanded ? lines : lines.length > 1 ? [lines[0], lines.slice(1).join(' ')] : lines
  if (singleToken && !expanded) return <Text {...props} style={style} numberOfLines={1} ellipsizeMode="tail">{children}</Text>
  return <View ref={accessibilityRef} testID={props.testID} style={styles.container} accessible accessibilityRole={props.accessibilityRole} accessibilityLanguage={props.accessibilityLanguage} accessibilityHint={props.accessibilityHint} accessibilityLabel={props.accessibilityLabel ?? children}>
    {!singleToken ? <Text {...props} accessible={false} importantForAccessibility="no-hide-descendants" style={[style, styles.measurement]} numberOfLines={undefined} ellipsizeMode="clip" textBreakStrategy="simple" android_hyphenationFrequency="none" onTextLayout={(event) => {
      const nextLines = wordLines(children, event.nativeEvent.lines.map((line) => line.text))
      setMeasurement((current) => current?.text === children && current.lines.join('\n') === nextLines.join('\n') ? current : { text: children, lines: nextLines })
    }}>{children}</Text> : null}
    {visibleLines.map((line, index) => expanded
      ? <ScrollView key={index} horizontal><Text {...props} accessible={false} style={visibleStyle} numberOfLines={1}>{line}</Text></ScrollView>
      : <Text {...props} key={index} accessible={false} style={visibleStyle} numberOfLines={1} ellipsizeMode="tail">{line}</Text>)}
  </View>
}

const styles = StyleSheet.create({
  container: { minWidth: 0, width: '100%' },
  measurement: { position: 'absolute', width: '100%', opacity: 0, pointerEvents: 'none' },
})
