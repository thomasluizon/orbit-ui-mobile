import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import {
  AlertTriangle,
  Lightbulb,
  Orbit,
  Star,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type {
  RetrospectiveHabitStat,
  RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { StatTile } from '@/components/ui/stat-tile'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { styles, type Tokens } from './retrospective-styles'

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

function renderNarrativeInline(text: string, tokens: Tokens) {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      const strong = /^\*\*(.+?)\*\*$/.exec(part)
      if (strong) {
        return (
          <Text
            key={`${part}-${index}`}
            style={[styles.narrativeStrong, { color: tokens.fg1 }]}
          >
            {strong[1]}
          </Text>
        )
      }
      return (
        <Text key={`${part}-${index}`} style={{ color: tokens.fg2 }}>
          {part}
        </Text>
      )
    })
}

interface DashboardCardProps {
  tokens: Tokens
  title: string
  icon?: LucideIcon
  children: React.ReactNode
}

function DashboardCard({
  tokens,
  title,
  icon: Icon,
  children,
}: Readonly<DashboardCardProps>) {
  return (
    <View
      style={[
        styles.dashCard,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
    >
      <View style={styles.dashCardTitleRow}>
        {Icon ? (
          <Icon size={15} color={tokens.primary} strokeWidth={1.9} />
        ) : null}
        <Text style={[styles.dashCardTitle, { color: tokens.fg2 }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  )
}

interface WeeklyConsistencyProps {
  tokens: Tokens
  values: number[]
}

function WeeklyConsistency({
  tokens,
  values,
}: Readonly<WeeklyConsistencyProps>) {
  const { t } = useTranslation()
  return (
    <DashboardCard tokens={tokens} title={t('retrospective.weeklyTitle')}>
      <View style={styles.barsRow}>
        {values.map((value, index) => {
          const clamped = Math.max(0, Math.min(100, value))
          const letter = t(`dates.daysShort.${WEEKDAY_KEYS[index]}`).charAt(0)
          return (
            <View key={WEEKDAY_KEYS[index]} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: Math.max(6, (clamped / 100) * 64),
                      backgroundColor: tokens.primary,
                      opacity: clamped === 0 ? 0.25 : 1,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: tokens.fg3 }]}>
                {letter}
              </Text>
            </View>
          )
        })}
      </View>
    </DashboardCard>
  )
}

interface HabitStatListProps {
  tokens: Tokens
  title: string
  habits: RetrospectiveHabitStat[]
  tone: 'default' | 'attention'
}

function HabitStatList({
  tokens,
  title,
  habits,
  tone,
}: Readonly<HabitStatListProps>) {
  const { t } = useTranslation()
  return (
    <DashboardCard tokens={tokens} title={title}>
      <View style={styles.habitList}>
        {habits.map((habit) => (
          <View key={habit.name} style={styles.habitRow}>
            <Text style={styles.habitEmoji}>{habit.emoji ?? '•'}</Text>
            <Text
              style={[styles.habitName, { color: tokens.fg1 }]}
              numberOfLines={1}
            >
              {habit.name}
            </Text>
            <Text
              style={[
                styles.habitRate,
                {
                  color:
                    tone === 'attention'
                      ? tokens.statusOverdueText
                      : tokens.fg2,
                },
              ]}
            >
              {habit.isOneTime
                ? habit.completedCount > 0
                  ? t('retrospective.completed')
                  : t('retrospective.notCompleted')
                : `${habit.completionRate}%`}
            </Text>
          </View>
        ))}
      </View>
    </DashboardCard>
  )
}

interface NarrativeSectionProps {
  tokens: Tokens
  icon: LucideIcon
  title: string
  body: string
}

function NarrativeSection({
  tokens,
  icon,
  title,
  body,
}: Readonly<NarrativeSectionProps>) {
  return (
    <DashboardCard tokens={tokens} title={title} icon={icon}>
      <Text style={[styles.narrativeBody, { color: tokens.fg2 }]}>
        {renderNarrativeInline(body, tokens)}
      </Text>
    </DashboardCard>
  )
}

interface RetrospectiveDashboardProps {
  tokens: Tokens
  data: RetrospectiveResponse
  fromCache: boolean
  isOnline: boolean
  onRegenerate: () => void
}

export function RetrospectiveDashboard({
  tokens,
  data,
  fromCache,
  isOnline,
  onRegenerate,
}: Readonly<RetrospectiveDashboardProps>) {
  const { t } = useTranslation()
  const { metrics, narrative } = data
  return (
    <View style={styles.contentWrap}>
      <Animated.View
        entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
        style={styles.dashStack}
      >
        <View style={styles.astraRow}>
          <View style={styles.astraEyebrowGroup}>
            <Orbit size={11} color={tokens.primary} strokeWidth={1.7} />
            <Text style={[styles.astraEyebrow, { color: tokens.fg3 }]}>
              {t('retrospective.astraEyebrow').toUpperCase()}
            </Text>
          </View>
          <View style={styles.astraActions}>
            <ShareCardEntryButton variant="chip" />
            <Pressable
              onPress={onRegenerate}
              disabled={!isOnline}
              accessibilityRole="button"
              accessibilityLabel={t('retrospective.regenerate')}
              style={({ pressed }) => [
                styles.actionChip,
                {
                  backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                  borderColor: tokens.hairline,
                },
                pressed ? styles.actionChipPressed : null,
              ]}
            >
              <Text style={[styles.actionChipText, { color: tokens.fg2 }]}>
                {t('retrospective.regenerate')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statTilesRow}>
          <StatTile
            emoji="🎯"
            value={`${metrics.completionRate}%`}
            label={t('retrospective.metrics.completionRate')}
          />
          <StatTile
            emoji="✅"
            value={metrics.totalCompletions}
            label={t('retrospective.metrics.logs')}
          />
          <StatTile
            emoji="🔥"
            value={metrics.currentStreak}
            label={t('retrospective.metrics.currentStreak')}
          />
        </View>

        <WeeklyConsistency tokens={tokens} values={metrics.weeklyConsistency} />

        {metrics.topHabits.length > 0 ? (
          <HabitStatList
            tokens={tokens}
            title={t('retrospective.topHabitsTitle')}
            habits={metrics.topHabits}
            tone="default"
          />
        ) : null}

        {metrics.needsAttention.length > 0 ? (
          <HabitStatList
            tokens={tokens}
            title={t('retrospective.needsAttentionTitle')}
            habits={metrics.needsAttention}
            tone="attention"
          />
        ) : null}

        <NarrativeSection
          tokens={tokens}
          icon={Star}
          title={t('retrospective.sections.highlights')}
          body={narrative.highlights}
        />
        <NarrativeSection
          tokens={tokens}
          icon={AlertTriangle}
          title={t('retrospective.sections.missed')}
          body={narrative.missed}
        />
        <NarrativeSection
          tokens={tokens}
          icon={TrendingUp}
          title={t('retrospective.sections.trends')}
          body={narrative.trends}
        />
        <NarrativeSection
          tokens={tokens}
          icon={Lightbulb}
          title={t('retrospective.sections.suggestion')}
          body={narrative.suggestion}
        />

        <Text style={[styles.aiDisclaimer, { color: tokens.fg3 }]}>
          {t('aiDisclosure.notMedicalAdvice')}
        </Text>
        {fromCache ? (
          <Text style={[styles.cachedText, { color: tokens.fg3 }]}>
            {t('retrospective.cached')}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  )
}
