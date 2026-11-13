import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, findNodeHandle, Keyboard, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { QuestionFlowProps } from '@orbit/shared/contracts/flow'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { ArrowLeft, X } from '@/components/ui/icons'
import { FlowLookProvider, useFlowLookState } from '@/components/ui/flow-look'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PagerSegments } from '@/components/ui/pager'
import { PillButton } from '@/components/ui/pill-button'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { useGuidedFlowTracking } from '@/hooks/use-guided-flow-tracking'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

const WIDE_SHIFT = 12
const WIDE_WIDTH = 1024
const SM_WIDTH = 640
const KEYBOARD_LOOK = { x: 0, y: 1 } as const

function FlowHeader({ props }: Readonly<{ props: QuestionFlowProps }>) {
  const { position, total, progressLabel, backLabel, closeLabel, onBack, onClose } = props
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View style={styles.header}>
      <View style={styles.slot}>
        {onBack ? <PillButton variant="ghost" iconOnly label={backLabel} minimumHeight={48} onClick={onBack}><ArrowLeft color={tokens.fg1} size={24} /></PillButton> : null}
      </View>
      <View style={styles.progress}><PagerSegments count={total} index={position - 1} label={progressLabel} /></View>
      <PillButton variant="ghost" iconOnly label={closeLabel} minimumHeight={48} onClick={onClose}><X color={tokens.fg1} size={24} /></PillButton>
    </View>
  )
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  return open
}

function useStepTravel(stepKey: string, direction: 1 | -1) {
  const { width } = useWindowDimensions()
  const reducedMotion = usePrefersReducedMotion()
  const [progress] = useState(() => new Animated.Value(1))
  const firstStep = useRef(stepKey)
  useEffect(() => {
    if (firstStep.current === stepKey) return
    progress.setValue(reducedMotion ? 1 : 0)
    if (reducedMotion) return
    const animation = Animated.timing(progress, { toValue: 1, duration: motionDurations.slow, useNativeDriver: true, easing: Easing.bezier(...motionEasings.standard) })
    animation.start()
    return () => animation.stop()
  }, [stepKey, progress, reducedMotion])
  const distance = width >= SM_WIDTH ? WIDE_SHIFT : width
  return {
    opacity: width >= SM_WIDTH ? progress : 1,
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [direction * distance, 0] }) }],
  }
}

function useQuestionFocus(stepKey: string, onStepChange: () => void) {
  const headingRef = useRef<Text>(null)
  const firstStep = useRef(stepKey)
  useEffect(() => {
    if (firstStep.current === stepKey) return
    const target = findNodeHandle(headingRef.current)
    if (target !== null) AccessibilityInfo.setAccessibilityFocus(target)
    onStepChange()
  }, [stepKey, onStepChange])
  return headingRef
}

/** The one-question flow frame. It holds no habit-specific code: a second consumer mounts it with its own content. */
export function QuestionFlow(props: Readonly<QuestionFlowProps>) {
  const { flow, question, line, stepKey, direction, orbitState = 'parado', statusText, options, children, primary, footer } = props
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const { width } = useWindowDimensions()
  const wide = width >= WIDE_WIDTH
  const { lookAt, mascotRef, lookAtControl, lookAway } = useFlowLookState()
  const lookControls = useMemo(() => ({ lookAtControl, lookAway }), [lookAtControl, lookAway])
  const keyboardOpen = useKeyboardOpen()
  const headingRef = useQuestionFocus(stepKey, lookAway)
  const announcement = useFlowAnnouncement(line, stepKey)
  useGuidedFlowTracking(flow, stepKey, props.total)
  const travel = useStepTravel(stepKey, direction)
  const shownLook = orbitState === 'parado' ? lookAt ?? (keyboardOpen ? KEYBOARD_LOOK : null) : null
  const primaryAction = primary ? (
    <View style={wide ? styles.primaryWide : styles.primaryCompact}>
      <PillButton loading={primary.loading} focusableWhenLoading hint={primary.hint} onClick={primary.onPress}>{primary.label}</PillButton>
    </View>
  ) : null

  return (
    <FlowLookProvider look={lookControls}>
      <View testID="question-flow" style={styles.root} accessibilityElementsHidden={false}>
        <FlowHeader props={props} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View key={stepKey} testID={`question-flow-step-${stepKey}`} style={[styles.block, travel]}>
            <View ref={mascotRef} collapsable={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <OrbitMascot size={wide ? 128 : 96} state={orbitState} lookAt={shownLook} turnKey={stepKey} />
            </View>
            {line ? <Text style={[styles.line, { color: tokens.fg2 }]}>{line}</Text> : null}
            <Text ref={headingRef} accessibilityRole="header" accessibilityHint={line ?? undefined} style={[styles.question, wide ? styles.questionWide : null, { color: tokens.fg1 }]} textBreakStrategy="balanced">{question}</Text>
            {options ? <View style={styles.options}>{options}</View> : null}
            {children ? <View style={styles.freePath}>{children}</View> : null}
            {wide ? primaryAction : null}
            {footer}
          </Animated.View>
        </ScrollView>
        <Text accessibilityLiveRegion="polite" style={styles.status}>{announcement || statusText || ''}</Text>
        {wide ? null : primaryAction}
      </View>
    </FlowLookProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  slot: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, minWidth: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  block: { width: '100%', maxWidth: 592, alignItems: 'center', gap: 24 },
  line: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  question: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  questionWide: { fontSize: 34, lineHeight: 39 },
  options: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  freePath: { width: '100%', gap: 12 },
  status: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  primaryCompact: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  primaryWide: { width: '100%', maxWidth: 360, paddingTop: 0 },
})
