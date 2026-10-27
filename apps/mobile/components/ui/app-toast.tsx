import { useResolvedMotionPreset } from '@/lib/motion'
import Reanimated, { Easing, Keyframe, ReduceMotion } from 'react-native-reanimated'
import * as Primitive from '@rn-primitives/toast'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useToastLifecycle } from '@/hooks/use-toast-lifecycle'
import type { ToastProps } from '@orbit/shared/contracts/feedback'
import { SPACING, TOUCH_TARGET_MIN, zLayers } from '@orbit/shared/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { IconButton } from '@/components/ui/icon-button'
import { Check, X, RefreshCw } from '@/components/ui/icons'
import { createTokensV2, radius, shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { resolveCenteredOverlayFrame } from './centered-overlay-frame'

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

function WorkingMark({ color }: Readonly<{ color: string }>) {
  return (
    <View style={styles.workingMark} testID="toast-working-mark" accessibilityElementsHidden>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  )
}

function useToastSwipe(dismiss: () => void) {
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) >= 48 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) dismiss()
    },
  }), [dismiss])
  return swipe
}

function ToastClose({ dismiss, onFocus, onBlur, color }: Readonly<{
  dismiss: () => void; onFocus: () => void; onBlur: () => void; color: string
}>) {
  const { t } = useTranslation()
  return (
    <Primitive.Close asChild><IconButton label={t('common.close')} onClick={dismiss} onFocus={onFocus} onBlur={onBlur}>
      <X size={20} color={color} />
    </IconButton></Primitive.Close>
  )
}

const AnimatedToast = Reanimated.createAnimatedComponent(Primitive.Root)

function useToastMotion() {
  const preset = useResolvedMotionPreset('toast')
  const entering = useMemo(() => new Keyframe({
    0: { opacity: 0, transform: [{ translateY: preset.shift }, { scale: preset.scaleFrom }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.bezier(...preset.enterEasing) },
  }).duration(preset.reducedMotionEnabled ? 0 : preset.enterDuration).reduceMotion(ReduceMotion.System), [preset])
  const exiting = useMemo(() => new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    100: { opacity: 0, transform: [{ translateY: preset.shift }, { scale: preset.scaleFrom }], easing: Easing.bezier(...preset.exitEasing) },
  }).duration(preset.reducedMotionEnabled ? 0 : preset.exitDuration).reduceMotion(ReduceMotion.System), [preset])
  return { entering, exiting }
}

export function Toast(props: Readonly<ToastProps & { outlined?: boolean; onDismiss?: () => void; persistent?: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [announcedMessage, setAnnouncedMessage] = useState('')
  const actionClosing = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const presentationRef = useRef<View | null>(null)
  const setPresentation = useCallback((element: View | null) => {
    if (!element) presentationRef.current?.setNativeProps({ pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })
    presentationRef.current = element
  }, [])
  const lossColors = { background: tokens.bg, action: tokens.primarySoft }
  const neutralColors = { background: tokens.bgSheet, action: tokens.fg1 }
  const colors = { neutral: neutralColors, working: neutralColors, done: neutralColors, lost: lossColors }[props.kind]

  const { dismissed, dismiss } = useToastLifecycle(props, hovered || focused, props.onDismiss, props.persistent)
  const swipe = useToastSwipe(dismiss)
  const motion = useToastMotion()

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncedMessage(props.message), 0)
    return () => clearTimeout(timer)
  }, [props.message])

  if (dismissed) return null

  return (
    <AnimatedToast ref={setPresentation} entering={motion.entering} exiting={motion.exiting} type="background" open onOpenChange={(open) => {
      if (actionClosing.current) { actionClosing.current = false; return }
      if (!open) dismiss()
    }}
      aria-live={props.kind === 'lost' ? 'assertive' : 'polite'}
      {...swipe.panHandlers}
      accessible={false}
      accessibilityLiveRegion={props.kind === 'lost' ? 'assertive' : 'polite'}
      accessibilityRole={props.kind === 'lost' ? 'alert' : undefined}
      accessibilityLabel={
        props.kind === 'lost' && announcedMessage
          ? `${announcedMessage}. ${props.detail}`
          : announcedMessage
      }
      focusable={false}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
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
      <ToastLeadingMark props={props} tokens={tokens} />

      <View style={[styles.copy, props.actionLabel ? styles.actionCopy : null]}>
        <Text style={[styles.message, { color: tokens.fg1 }]}>{announcedMessage}</Text>
        {props.kind === 'lost' && announcedMessage ? (
          <Text style={[styles.detail, { color: tokens.fg3 }]}>{props.detail}</Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        {props.actionLabel ? <ToastAction props={props} actionClosing={actionClosing} tokens={tokens} actionColor={colors.action} setFocused={setFocused} /> : null}
        <ToastClose dismiss={dismiss} color={tokens.fg2} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      </View>
    </AnimatedToast>
  )
}

export function AppToast({ placement = 'overlay', sheetId }: Readonly<{ placement?: 'overlay' | 'slot' | 'sheet'; sheetId?: string }>) {
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const overlayFrame = resolveCenteredOverlayFrame(screenWidth - insets.left - insets.right, 420)
  const currentToast = useAppToastStore((state) => state.currentToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const dismissToast = useAppToastStore((state) => state.dismissToast)
  const toastId = currentToast?.id
  const dismiss = useCallback(() => { if (toastId !== undefined) dismissToast(toastId) }, [dismissToast, toastId])
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

  if (placement !== 'overlay') return <Toast key={currentToast.id} {...hostedToast} onDismiss={dismiss} outlined={placement === 'sheet'} />

  return (
    <View pointerEvents="box-none" style={[styles.host, styles.overlay, { bottom: insets.bottom + 16, left: 0, width: screenWidth }]}>
      <View testID="toast-content-frame" style={[overlayFrame, { left: insets.left + overlayFrame.left }]}><Toast key={currentToast.id} {...hostedToast} onDismiss={dismiss} /></View>
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    rowGap: 0,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: SPACING.s16,
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
  actionCopy: { flexBasis: '50%' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12, marginStart: 'auto', flexShrink: 0 },
  message: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
  detail: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  action: { padding: SPACING.s8, minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN },
  actionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})

function ToastAction({ props, actionClosing, tokens, actionColor, setFocused }: Readonly<{
  props: Extract<ToastProps, { actionLabel: string }>
  actionClosing: RefObject<boolean>
  tokens: AppTokensV2
  actionColor: string
  setFocused: (focused: boolean) => void
}>) {
  const [actionPressed, setActionPressed] = useState(false)
  const [actionFocused, setActionFocused] = useState(false)
  return props.actionIcon ? <Primitive.Action asChild><IconButton label={props.actionLabel} onPress={() => { actionClosing.current = true; props.onAction() }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}><RefreshCw size={20} accessible={false} /></IconButton></Primitive.Action> : <Primitive.Action asChild><Pressable
            onPress={() => { actionClosing.current = true; props.onAction() }}
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
              color: resolveActionColor(props.kind, actionPressed, actionColor, tokens),
            }]}>
              {props.actionLabel}
            </Text>
          </Pressable></Primitive.Action>
}

function ToastLeadingMark({ props, tokens }: Readonly<{ props: ToastProps; tokens: AppTokensV2 }>) {
  return <>
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

  </>
}
