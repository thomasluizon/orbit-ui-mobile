import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  withTiming,
} from 'react-native-reanimated'
import { Plus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import type { AppTokens, createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const RING_SIZE = 180
const RING_RADIUS = 70
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function ringTrackColor(tokens: AppTokens): string {
  const normalized = tokens.fg1.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, 0.08)`
}

interface GoalProgressBlockProps {
  progressPct: number
  progressFillColor: string
  progressText: string
  progressPercentage: number
  showEdit: boolean
  onEdit: () => void
  styles: GoalDetailStyles
  tokens: AppTokens
}

export function GoalProgressBlock({
  progressPct,
  progressFillColor,
  progressText,
  progressPercentage,
  showEdit,
  onEdit,
  styles,
  tokens,
}: Readonly<GoalProgressBlockProps>) {
  const { t } = useTranslation()
  const clamped = Math.min(100, Math.max(0, progressPct))

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: withTiming(RING_CIRCUMFERENCE * (1 - clamped / 100), {
      duration: 280,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      reduceMotion: ReduceMotion.System,
    }),
  }))

  const percentLabel = t('goals.progressPercentage', { pct: progressPercentage })

  return (
    <View>
      <SectionLabel top={4} bottom={8}>
        {t('goals.progress')}
      </SectionLabel>
      <View style={styles.progressBlock}>
        <View
          style={styles.ringWrap}
          accessibilityRole="progressbar"
          accessibilityLabel={percentLabel}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
        >
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ transform: [{ rotate: '-90deg' }] }}
          >
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={ringTrackColor(tokens)}
              strokeWidth={12}
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={progressFillColor}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              animatedProps={arcProps}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={styles.ringValue}>{percentLabel}</Text>
            <Text style={styles.ringMeta}>{progressText}</Text>
          </View>
        </View>
        {showEdit ? (
          <PillButton
            fullWidth
            style={styles.progressCta}
            onPress={onEdit}
            accessibilityLabel={t('goals.updateProgress')}
            leading={
              <Plus size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />
            }
          >
            {t('goals.updateProgress')}
          </PillButton>
        ) : null}
      </View>
    </View>
  )
}
