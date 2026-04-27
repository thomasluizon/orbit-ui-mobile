export const motionScenarios = [
  'tab-switch',
  'route-push',
  'route-replace',
  'sheet',
  'dialog',
  'menu',
  'toast',
  'list-enter',
  'list-exit',
  'selection',
  'success-feedback',
  'theme-change',
] as const

export type MotionScenario = (typeof motionScenarios)[number]

export type MotionNavigationIntent =
  | 'neutral'
  | 'tab'
  | 'forward'
  | 'back'
  | 'replace'
  | 'modal-close'

export type MotionBezier = readonly [number, number, number, number]

export interface MotionSpringPreset {
  readonly stiffness: number
  readonly damping: number
  readonly mass: number
  readonly restSpeedThreshold: number
  readonly restDisplacementThreshold: number
}

export const motionEasings = {
  standard: [0.2, 0, 0, 1] as MotionBezier,
  enter: [0.16, 1, 0.3, 1] as MotionBezier,
  exit: [0.4, 0, 1, 1] as MotionBezier,
  emphasize: [0.34, 1.56, 0.64, 1] as MotionBezier,
  linear: [0, 0, 1, 1] as MotionBezier,
} as const

export const motionDurations = {
  instant: 0,
  micro: 120,
  fast: 160,
  base: 220,
  slow: 320,
  route: 280,
  overlay: 260,
  toast: 220,
  theme: 260,
  celebration: 560,
  shimmer: 3000,
  creationGlow: 1200,
  completePop: 500,
  completeGlow: 800,
  completeSpark: 600,
  listStagger: 36,
} as const

export const motionLayerTiming = {
  backdropEnterDelay: 0,
  panelEnterDelay: 32,
  panelExitLead: 0,
  contentStagger: motionDurations.listStagger,
  routeShift: 18,
  toastLift: 14,
  tabShift: 10,
} as const

export const orbitalMotion = {
  press: {
    scale: 0.985,
    translateY: -1,
    duration: 100,
  },
  elevatedPress: {
    scale: 0.98,
    translateY: -2,
    duration: motionDurations.micro,
  },
  list: {
    maxStaggerItems: 6,
    staggerMs: 40,
    initialScale: 0.985,
  },
  route: {
    backgroundTintOpacity: 0.12,
  },
  completion: {
    peakScale: 1.12,
    reducedPeakScale: 1.04,
    flashOpacity: 0.24,
    reducedFlashOpacity: 0.12,
    glowScale: 1.4,
  },
} as const

export const motionSprings = {
  soft: {
    stiffness: 220,
    damping: 26,
    mass: 1,
    restSpeedThreshold: 0.4,
    restDisplacementThreshold: 0.4,
  },
  snappy: {
    stiffness: 320,
    damping: 28,
    mass: 0.9,
    restSpeedThreshold: 0.6,
    restDisplacementThreshold: 0.6,
  },
  sheet: {
    stiffness: 360,
    damping: 34,
    mass: 1,
    restSpeedThreshold: 0.6,
    restDisplacementThreshold: 0.6,
  },
  completion: {
    stiffness: 380,
    damping: 24,
    mass: 0.9,
    restSpeedThreshold: 0.7,
    restDisplacementThreshold: 0.7,
  },
} as const satisfies Record<string, MotionSpringPreset>

type MotionSpringName = keyof typeof motionSprings

interface MotionFallbackPreset {
  readonly enterDuration: number
  readonly exitDuration: number
  readonly enterEasing: MotionBezier
  readonly exitEasing: MotionBezier
  readonly shift: number
  readonly scaleFrom: number
  readonly scaleTo: number
}

export interface MotionPreset {
  readonly scenario: MotionScenario
  readonly enterDuration: number
  readonly exitDuration: number
  readonly enterEasing: MotionBezier
  readonly exitEasing: MotionBezier
  readonly shift: number
  readonly scaleFrom: number
  readonly scaleTo: number
  readonly spring: MotionSpringName
  readonly reducedMotion: MotionFallbackPreset
}

export const motionPresets: Record<MotionScenario, MotionPreset> = {
  'tab-switch': {
    scenario: 'tab-switch',
    enterDuration: motionDurations.fast,
    exitDuration: motionDurations.micro,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: motionLayerTiming.tabShift,
    scaleFrom: 0.995,
    scaleTo: 1,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 90,
      exitDuration: 70,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  'route-push': {
    scenario: 'route-push',
    enterDuration: motionDurations.route,
    exitDuration: motionDurations.fast,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: motionLayerTiming.routeShift,
    scaleFrom: 0.992,
    scaleTo: 1,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 120,
      exitDuration: 90,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  'route-replace': {
    scenario: 'route-replace',
    enterDuration: motionDurations.base,
    exitDuration: motionDurations.micro,
    enterEasing: motionEasings.standard,
    exitEasing: motionEasings.exit,
    shift: 12,
    scaleFrom: 0.998,
    scaleTo: 1,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 100,
      exitDuration: 70,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  sheet: {
    scenario: 'sheet',
    enterDuration: motionDurations.overlay,
    exitDuration: motionDurations.fast,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: 28,
    scaleFrom: 1,
    scaleTo: 1,
    spring: 'sheet',
    reducedMotion: {
      enterDuration: 120,
      exitDuration: 90,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 8,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  dialog: {
    scenario: 'dialog',
    enterDuration: motionDurations.overlay,
    exitDuration: motionDurations.fast,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: 16,
    scaleFrom: 0.96,
    scaleTo: 1,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 110,
      exitDuration: 80,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  menu: {
    scenario: 'menu',
    enterDuration: motionDurations.fast,
    exitDuration: motionDurations.micro,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: 8,
    scaleFrom: 0.98,
    scaleTo: 1,
    spring: 'snappy',
    reducedMotion: {
      enterDuration: 80,
      exitDuration: 60,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  toast: {
    scenario: 'toast',
    enterDuration: motionDurations.toast,
    exitDuration: motionDurations.fast,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: motionLayerTiming.toastLift,
    scaleFrom: 0.98,
    scaleTo: 1,
    spring: 'snappy',
    reducedMotion: {
      enterDuration: 90,
      exitDuration: 70,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  'list-enter': {
    scenario: 'list-enter',
    enterDuration: motionDurations.base,
    exitDuration: motionDurations.micro,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: 12,
    scaleFrom: 0.992,
    scaleTo: 1,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 90,
      exitDuration: 70,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  'list-exit': {
    scenario: 'list-exit',
    enterDuration: motionDurations.fast,
    exitDuration: motionDurations.fast,
    enterEasing: motionEasings.enter,
    exitEasing: motionEasings.exit,
    shift: 10,
    scaleFrom: 1,
    scaleTo: 0.99,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 80,
      exitDuration: 70,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  selection: {
    scenario: 'selection',
    enterDuration: motionDurations.fast,
    exitDuration: motionDurations.micro,
    enterEasing: motionEasings.standard,
    exitEasing: motionEasings.exit,
    shift: 6,
    scaleFrom: 0.97,
    scaleTo: 1,
    spring: 'snappy',
    reducedMotion: {
      enterDuration: 80,
      exitDuration: 60,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  'success-feedback': {
    scenario: 'success-feedback',
    enterDuration: motionDurations.completePop,
    exitDuration: motionDurations.fast,
    enterEasing: motionEasings.emphasize,
    exitEasing: motionEasings.exit,
    shift: 0,
    scaleFrom: 0.92,
    scaleTo: 1,
    spring: 'completion',
    reducedMotion: {
      enterDuration: 120,
      exitDuration: 90,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
  'theme-change': {
    scenario: 'theme-change',
    enterDuration: motionDurations.theme,
    exitDuration: motionDurations.micro,
    enterEasing: motionEasings.standard,
    exitEasing: motionEasings.exit,
    shift: 0,
    scaleFrom: 1,
    scaleTo: 1,
    spring: 'soft',
    reducedMotion: {
      enterDuration: 120,
      exitDuration: 90,
      enterEasing: motionEasings.linear,
      exitEasing: motionEasings.linear,
      shift: 0,
      scaleFrom: 1,
      scaleTo: 1,
    },
  },
}

export interface ResolvedMotionPreset extends Omit<MotionPreset, 'reducedMotion'> {
  readonly reducedMotionEnabled: boolean
}

export function resolveMotionPreset(
  scenario: MotionScenario,
  prefersReducedMotion = false,
): ResolvedMotionPreset {
  const preset = motionPresets[scenario]
  if (!prefersReducedMotion) {
    return {
      ...preset,
      reducedMotionEnabled: false,
    }
  }

  return {
    ...preset,
    ...preset.reducedMotion,
    reducedMotionEnabled: true,
  }
}

