import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeInUp, ReduceMotion } from 'react-native-reanimated'
import {
  AlertTriangle,
  Lightbulb,
  Orbit,
  RefreshCw,
  Star,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type {
  RetrospectiveHabitStat,
  RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { tintFromPrimary } from '@/lib/theme'
import { StatTile } from '@/components/ui/stat-tile'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { WrappedEntryButton } from '@/components/wrapped/wrapped-entry-button'
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

function resolveHabitStatLabel(
  habit: RetrospectiveHabitStat,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (!habit.isOneTime) return `${habit.completionRate}%`
  return habit.completedCount > 0
    ? t('retrospective.completed')
    : t('retrospective.notCompleted')
}

function renderNarrativeInline(text: string, tokens: Tokens) {
  const segments: { key: string; part: string }[] = []
  let offset = 0
  for (const part of text.split(/(\*\*.+?\*\*)/g)) {
    if (part) segments.push({ key: `seg-${offset}`, part })
    offset += part.length
  }
  return segments.map(({ key, part }) => {
    const strong = /^\*\*(.+?)\*\*$/.exec(part)
    if (strong) {
      return (
        <Text
          key={key}
          style={[styles.narrativeStrong, { color: tokens.fg1 }]}
        >
          {strong[1]}
        </Text>
      )
    }
    return (
      <Text key={key} style={{ color: tokens.fg2 }}>
        {part}
      </Text>
    )
  })
}

interface DashboardCardProps {
  tokens: Tokens
  title: string
  icon?: LucideIcon
  accent?: boolean
  children: React.ReactNode
}

function DashboardCard({
  tokens,
  title,
  icon: Icon,
  accent = false,
  children,
}: Readonly<DashboardCardProps>) {
  return (
    <View
      style={[
        styles.dashCard,
        {
          backgroundColor: accent ? tintFromPrimary(tokens, 0.08) : tokens.bgCard,
          borderColor: accent ? tintFromPrimary(tokens, 0.28) : tokens.hairline,
        },
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
          const dayName = t(`dates.daysShort.${WEEKDAY_KEYS[index]}`)
          return (
            <View
              key={WEEKDAY_KEYS[index]}
              style={styles.barColumn}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('retrospective.weeklyBarLabel', {
                day: dayName,
                percent: clamped,
              })}
            >
              <View style={styles.barTrack}>
                <Animated.View
                  entering={FadeInUp.duration(220)
                    .delay(index * 40)
                    .reduceMotion(ReduceMotion.System)}
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
                {dayName.charAt(0)}
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
              {resolveHabitStatLabel(habit, t)}
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
  accent?: boolean
}

function NarrativeSection({
  tokens,
  icon,
  title,
  body,
  accent = false,
}: Readonly<NarrativeSectionProps>) {
  return (
    <DashboardCard tokens={tokens} title={title} icon={icon} accent={accent}>
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

  const sections: { key: string; node: React.ReactNode }[] = [
    {
      key: 'header',
      node: (
        <View style={styles.astraRow}>
          <View style={styles.astraEyebrowGroup}>
            <Orbit size={11} color={tokens.primary} strokeWidth={1.7} />
            <Text style={[styles.astraEyebrow, { color: tokens.fg3 }]}>
              {t('retrospective.astraEyebrow').toUpperCase()}
            </Text>
          </View>
          <View style={styles.astraActions}>
            <WrappedEntryButton />
            <ShareCardEntryButton variant="chip" />
            <Pressable
              onPress={onRegenerate}
              disabled={!isOnline}
              accessibilityRole="button"
              accessibilityLabel={t('retrospective.regenerate')}
              hitSlop={{ top: 5, bottom: 5 }}
              style={({ pressed }) => [
                styles.actionChip,
                {
                  backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                  borderColor: tokens.hairline,
                },
                pressed ? styles.actionChipPressed : null,
              ]}
            >
              <RefreshCw size={14} color={tokens.fg2} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
      ),
    },
    {
      key: 'stats',
      node: (
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
      ),
    },
    {
      key: 'weekly',
      node: <WeeklyConsistency tokens={tokens} values={metrics.weeklyConsistency} />,
    },
    ...(metrics.topHabits.length > 0
      ? [
          {
            key: 'top',
            node: (
              <HabitStatList
                tokens={tokens}
                title={t('retrospective.topHabitsTitle')}
                habits={metrics.topHabits}
                tone="default"
              />
            ),
          },
        ]
      : []),
    ...(metrics.needsAttention.length > 0
      ? [
          {
            key: 'attention',
            node: (
              <HabitStatList
                tokens={tokens}
                title={t('retrospective.needsAttentionTitle')}
                habits={metrics.needsAttention}
                tone="attention"
              />
            ),
          },
        ]
      : []),
    {
      key: 'highlights',
      node: (
        <NarrativeSection
          tokens={tokens}
          icon={Star}
          title={t('retrospective.sections.highlights')}
          body={narrative.highlights}
        />
      ),
    },
    {
      key: 'missed',
      node: (
        <NarrativeSection
          tokens={tokens}
          icon={AlertTriangle}
          title={t('retrospective.sections.missed')}
          body={narrative.missed}
        />
      ),
    },
    {
      key: 'trends',
      node: (
        <NarrativeSection
          tokens={tokens}
          icon={TrendingUp}
          title={t('retrospective.sections.trends')}
          body={narrative.trends}
        />
      ),
    },
    {
      key: 'suggestion',
      node: (
        <NarrativeSection
          tokens={tokens}
          icon={Lightbulb}
          title={t('retrospective.sections.suggestion')}
          body={narrative.suggestion}
          accent
        />
      ),
    },
    {
      key: 'disclaimer',
      node: (
        <Text style={[styles.aiDisclaimer, { color: tokens.fg3 }]}>
          {t('aiDisclosure.notMedicalAdvice')}
        </Text>
      ),
    },
    ...(fromCache
      ? [
          {
            key: 'cached',
            node: (
              <Text style={[styles.cachedText, { color: tokens.fg3 }]}>
                {t('retrospective.cached')}
              </Text>
            ),
          },
        ]
      : []),
  ]

  return (
    <View style={styles.contentWrap}>
      <View style={styles.dashStack}>
        {sections.map((section, index) => (
          <Animated.View
            key={section.key}
            entering={FadeInDown.duration(280)
              .delay(index * 50)
              .reduceMotion(ReduceMotion.System)}
          >
            {section.node}
          </Animated.View>
        ))}
      </View>
    </View>
  )
}
