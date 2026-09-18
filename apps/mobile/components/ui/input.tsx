import type { InputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useKeyboardAwareInputReveal } from '@/components/ui/keyboard-aware-scroll-view'

type Tokens = ReturnType<typeof createTokensV2>
function getKeyboardType(kind: InputProps['kind'], inputMode: InputProps['inputMode']) {
  if (kind === 'email' || inputMode === 'email') return 'email-address'
  if (inputMode === 'decimal') return 'decimal-pad'
  if (kind === 'number' || inputMode === 'numeric') return 'number-pad'
  return 'default'
}

function Marks({ props, tokens }: Readonly<{ props: InputProps; tokens: Tokens }>) {
  const marks = props.multiline && 'marks' in props ? props.marks : undefined
  const label = props.multiline && 'marksLabel' in props ? props.marksLabel : undefined
  if (!marks?.length) return null
  return <View accessible accessibilityLabel={label} style={[styles.marks, { borderTopColor: tokens.hairline }]}>{marks.map((mark) => <Text key={`${mark.start}-${mark.end}`} style={[styles.mark, { backgroundColor: tokens.bgWell, color: tokens.fg2 }]}>{props.value.slice(mark.start, mark.end)}</Text>)}</View>
}

function Control({ props, tokens }: Readonly<{ props: InputProps; tokens: Tokens }>) {
  const inputRef = useRef<TextInput>(null)
  const keyboardAware = useKeyboardAwareInputReveal()
  const [focused, setFocused] = useState(false)
  const multiline = props.multiline === true
  const borderColor = props.error ? tokens.statusBad : tokens.borderControl
  useEffect(() => { if (props.focusRequest) inputRef.current?.focus() }, [props.focusRequest])
  return <View testID="input-control" style={[styles.control, { backgroundColor: tokens.bgField, borderColor, borderWidth: props.error ? 2 : 1, outlineColor: tokens.primary, outlineOffset: 2, outlineWidth: focused && !props.disabled ? 2 : 0 }, props.disabled ? styles.disabled : null]}>
    <TextInput ref={inputRef} value={props.value} onChangeText={props.onChange} placeholder={props.placeholder} placeholderTextColor={tokens.fg3} editable={!props.disabled} maxLength={props.maxLength} multiline={multiline || undefined} numberOfLines={multiline ? props.rows : undefined} textAlignVertical={multiline ? 'top' : 'center'} keyboardType={getKeyboardType(props.kind, props.inputMode)} autoComplete={props.autoComplete === 'off' ? 'off' : props.autoComplete} autoCapitalize={props.kind === 'email' ? 'none' : 'sentences'} autoCorrect={props.kind !== 'email'} autoFocus={props.autoFocus} onSubmitEditing={props.onSubmit} accessibilityLabel={props.label} accessibilityState={{ disabled: props.disabled }} accessibilityHint={[props.error, props.hint].filter(Boolean).join(' ') || undefined} onFocus={() => { setFocused(true); keyboardAware?.revealInput(inputRef.current) }} onBlur={() => { setFocused(false); props.onBlur?.() }} style={[styles.input, multiline ? styles.multiline : null, { color: tokens.fg1, fontFamily: props.mono ? 'GeistMono_400Regular' : 'Geist_400Regular' }]} />
    {props.trailing ? <View style={styles.trailing}>{props.trailing}</View> : null}
    <Marks props={props} tokens={tokens} />
  </View>
}

function Captions({ error, hint, tokens }: Readonly<{ error?: string; hint?: string; tokens: Tokens }>) {
  return <>{error ? <Text accessibilityRole="alert" style={[styles.caption, { color: tokens.statusBadText }]}>{error}</Text> : null}{hint ? <Text style={[styles.caption, { color: tokens.fg2 }]}>{hint}</Text> : null}</>
}

export function Input(props: Readonly<InputProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  return <View style={styles.root} data-multiline={props.multiline ? '' : undefined} data-error={props.error ? '' : undefined}><Text style={[styles.label, { color: tokens.fg2 }]}>{props.label}</Text><Control props={props} tokens={tokens} /><Captions error={props.error} hint={props.hint} tokens={tokens} /></View>
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 8 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  control: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  input: { width: '100%', minHeight: 54, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, lineHeight: 24 },
  multiline: { minHeight: 96 },
  trailing: { position: 'absolute', right: 16, top: 16 },
  disabled: { opacity: 0.6 },
  caption: { fontFamily: 'Geist_400Regular', fontSize: 12 },
  marks: { borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8 },
  mark: { borderRadius: 8, fontFamily: 'Geist_400Regular', fontSize: 12, paddingHorizontal: 8, paddingVertical: 4 },
})
