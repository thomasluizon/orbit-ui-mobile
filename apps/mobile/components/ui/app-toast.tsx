import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToastProps } from '@orbit/shared/contracts/feedback'
import { TOUCH_TARGET_MIN, zLayers } from '@orbit/shared/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Check } from '@/components/ui/icons'
import { createTokensV2, radius, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { resolveCenteredOverlayFrame } from './centered-overlay-frame'

const MINIMUM_TOAST_LIFE_MS = 5000

function resolveActionColor(
  kind: ToastProps['kind'],
  pressed: boolean,
  rest: string,
  tokens: ReturnType<typeof createTokensV2>,
) {
  if (!pressed) return rest
  return kind === 'lost' ? tokens.fg1 : tokens.fg2
}

function resolveActionOutline(focused: boolean, color: string) {
  return focused ? {
    outlineWidth: 2,
    outlineStyle: 'solid' as const,
    outlineColor: color,
    outlineOffset: 2,
  } : undefined
}

function useToastLife(
  kind: ToastProps['kind'],
  message: string,
  doneAfterMs: number | undefined,
  onDone: (() => void) | undefined,
  paused: boolean,
) {
  const remainingMs = useRef(MINIMUM_TOAST_LIFE_MS)
  const completed = useRef(false)

  useEffect(() => {
    remainingMs.current = Math.max(MINIMUM_TOAST_LIFE_MS, doneAfterMs ?? MINIMUM_TOAST_LIFE_MS)
    completed.current = false
  }, [doneAfterMs, kind, message, onDone])

  useEffect(() => {
    if (!onDone || paused || completed.current) return

    const startedAt = Date.now()
    const timer = setTimeout(() => {
      if (completed.current) return
      completed.current = true
      remainingMs.current = 0
      onDone()
    }, remainingMs.current)

    return () => {
      clearTimeout(timer)
      if (!completed.current) {
        remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt))
      }
    }
  }, [kind, onDone, paused])
}

function WorkingMark({ color }: Readonly<{ color: string }>) {
  return (
    <View style={styles.workingMark} testID="toast-working-mark" accessibilityElementsHidden>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  )
}

/** Stable Android live-region feedback. It owns no position, scrim, focus, or z-index. */
export function Toast(props: Readonly<ToastProps & { outlined?: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [announcedMessage, setAnnouncedMessage] = useState('')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [actionPressed, setActionPressed] = useState(false)
  const [actionFocused, setActionFocused] = useState(false)
  const onDone = props.kind === 'done' || props.kind === 'neutral' ? props.onDone : undefined
  const doneAfterMs = props.kind === 'done' || props.kind === 'neutral' ? props.doneAfterMs : undefined
  const lossColors = { background: tokens.bg, action: tokens.primarySoft }
  const neutralColors = { background: tokens.bgSheet, action: tokens.fg1 }
  const colors = { neutral: neutralColors, working: neutralColors, done: neutralColors, lost: lossColors }[props.kind]

  useToastLife(props.kind, props.message, doneAfterMs, onDone, hovered || focused)

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncedMessage(props.message), 0)
    return () => clearTimeout(timer)
  }, [props.message])

  return (
    <Pressable
      accessible
      accessibilityLiveRegion={props.kind === 'lost' ? 'assertive' : 'polite'}
      accessibilityRole={props.kind === 'lost' ? 'alert' : undefined}
      accessibilityLabel={
        props.kind === 'lost' && announcedMessage
          ? `${announcedMessage}. ${props.detail}`
          : announcedMessage
      }
      focusable={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.toast,
        {
          backgroundColor: colors.background,
          borderColor: props.outlined ? tokens.fg3 : tokens.hairline,
        },
      ]}
      testID={`toast-${props.kind}`}
    >
      {props.kind === 'working' ? <WorkingMark color={tokens.fg2} /> : null}
      {props.kind === 'done' ? (
        <View
          style={[styles.doneMark, { backgroundColor: tokens.statusDone }]}
          testID="toast-done-mark"
          accessibilityElementsHidden
        >
          <Check size={16} strokeWidth={2.4} color={tokens.bg} />
        </View>
      ) : null}
      {(props.kind === 'neutral' || props.kind === 'lost') && props.icon ? (
        <View style={styles.icon} accessibilityElementsHidden>
          {props.icon}
        </View>
      ) : null}

      <View style={styles.copy}>
        <Text style={[styles.message, { color: tokens.fg1 }]}>{announcedMessage}</Text>
        {props.kind === 'lost' && announcedMessage ? (
          <Text style={[styles.detail, { color: tokens.fg3 }]}>{props.detail}</Text>
        ) : null}
      </View>

      {(props.kind === 'neutral' || props.kind === 'lost') && props.actionLabel ? (
        <Pressable
          onPress={props.onAction}
          onPressIn={() => setActionPressed(true)}
          onPressOut={() => setActionPressed(false)}
          onFocus={() => { setFocused(true); setActionFocused(true) }}
          onBlur={() => { setFocused(false); setActionPressed(false); setActionFocused(false) }}
          accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          style={[styles.action, resolveActionOutline(actionFocused, tokens.fg1)]}
          testID="toast-action"
        >
          <Text style={[styles.actionText, {
            color: resolveActionColor(props.kind, actionPressed, colors.action, tokens),
          }]}>
            {props.actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  )
}

/** Legacy root mount. The host owns placement and adapts the queue to the prop-driven Toast. */
export function AppToast({ placement = 'overlay', sheetId }: Readonly<{ placement?: 'overlay' | 'slot' | 'sheet'; sheetId?: string }>) {
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const overlayFrame = resolveCenteredOverlayFrame(screenWidth, 420)
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const topOverlayId = useUIStore((state) => state.openOverlayIds.at(-1))

  if (placement === 'sheet') {
    if (!sheetId || topOverlayId !== sheetId) return null
  } else if (topOverlayId?.startsWith('sheet:')) return null
  if (!currentToast) return null

  const toast = currentToast.toast
  const hostedToast =
    (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
      ? { ...toast, onAction: triggerAction }
      : toast

  if (placement !== 'overlay') return <Toast {...hostedToast} outlined={placement === 'sheet'} />

  return (
    <View pointerEvents="box-none" style={[styles.host, styles.overlay, overlayFrame, { bottom: insets.bottom + 16 }]}>
      <Toast {...hostedToast} />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
  },
  host: {
    zIndex: zLayers.toast,
  },
  toast: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 16,
    ...shadowsV2.shadow2,
  },
  workingMark: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: radius.full },
  doneMark: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { flexShrink: 0 },
  copy: { flex: 1, gap: 4 },
  message: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  detail: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  action: { padding: 8, minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN },
  actionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})
