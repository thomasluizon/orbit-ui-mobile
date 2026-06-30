'use client'

import type { ComponentType, CSSProperties } from 'react'
import {
  AlertTriangle,
  Lightbulb,
  Orbit,
  Star,
  TrendingUp,
  type LucideProps,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type {
  RetrospectiveHabitStat,
  RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { StatTile } from '@/components/ui/stat-tile'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'

const sectionTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--fg-2)',
  letterSpacing: '0.01em',
}

const cardStyle: CSSProperties = {
  borderRadius: 18,
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
  padding: '16px 18px',
}

function renderInlineMarkdown(text: string) {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      const strong = /^\*\*(.+?)\*\*$/.exec(part)
      if (strong) {
        return (
          <strong key={`${part}-${index}`} style={{ color: 'var(--fg-1)', fontWeight: 500 }}>
            {strong[1]}
          </strong>
        )
      }
      return <span key={`${part}-${index}`}>{part}</span>
    })
}

function WeeklyConsistency({ values }: Readonly<{ values: number[] }>) {
  const t = useTranslations()
  const dayKeys = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>{t('retrospective.weeklyTitle')}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 8,
          marginTop: 14,
          alignItems: 'end',
          height: 88,
        }}
      >
        {values.map((value, index) => {
          const clamped = Math.max(0, Math.min(100, value))
          const letter = t(`dates.daysShort.${dayKeys[index]}`).charAt(0)
          return (
            <div
              key={dayKeys[index]}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                height: '100%',
                justifyContent: 'flex-end',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: '100%',
                  maxWidth: 22,
                  height: `${Math.max(6, (clamped / 100) * 64)}px`,
                  borderRadius: 6,
                  background: 'var(--primary)',
                  opacity: clamped === 0 ? 0.25 : 1,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {letter}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HabitStatList({
  title,
  habits,
  tone,
}: Readonly<{
  title: string
  habits: RetrospectiveHabitStat[]
  tone: 'default' | 'attention'
}>) {
  const t = useTranslations()
  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {habits.map((habit) => (
          <div
            key={habit.name}
            className="flex items-center"
            style={{ gap: 12 }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
              {habit.emoji ?? '•'}
            </span>
            <span
              className="min-w-0 flex-1 truncate"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-1)' }}
            >
              {habit.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
                color: tone === 'attention' ? 'var(--status-overdue-text)' : 'var(--fg-2)',
              }}
            >
              {habit.isOneTime
                ? habit.completedCount > 0
                  ? t('retrospective.completed')
                  : t('retrospective.notCompleted')
                : `${habit.completionRate}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NarrativeSection({
  icon: Icon,
  title,
  body,
}: Readonly<{
  icon: ComponentType<LucideProps>
  title: string
  body: string
}>) {
  return (
    <div style={cardStyle}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <Icon size={15} strokeWidth={1.9} color="var(--primary)" aria-hidden="true" />
        <span style={sectionTitleStyle}>{title}</span>
      </div>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14.5,
          lineHeight: 1.55,
          color: 'var(--fg-2)',
          marginTop: 10,
        }}
      >
        {renderInlineMarkdown(body)}
      </p>
    </div>
  )
}

interface RetrospectiveDashboardProps {
  data: RetrospectiveResponse
  fromCache: boolean
  isOnline: boolean
  onRegenerate: () => void
}

export function RetrospectiveDashboard({
  data,
  fromCache,
  isOnline,
  onRegenerate,
}: Readonly<RetrospectiveDashboardProps>) {
  const t = useTranslations()
  const { metrics, narrative } = data

  return (
    <div
      className="flex flex-col animate-scale-in"
      style={{ gap: 12, padding: '16px 20px 24px' }}
    >
      <div className="flex items-center justify-between" style={{ gap: 6 }}>
        <div
          className="inline-flex items-center uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            fontWeight: 500,
            color: 'var(--fg-3)',
            letterSpacing: '0.06em',
            gap: 6,
          }}
        >
          <Orbit size={11} strokeWidth={1.7} color="var(--primary)" />
          {t('retrospective.astraEyebrow')}
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <ShareCardEntryButton variant="chip" />
          <button
            type="button"
            className="chip"
            onClick={onRegenerate}
            disabled={!isOnline}
          >
            {t('retrospective.regenerate')}
          </button>
        </div>
      </div>

      <div className="flex" style={{ gap: 10 }}>
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
      </div>

      <WeeklyConsistency values={metrics.weeklyConsistency} />

      {metrics.topHabits.length > 0 && (
        <HabitStatList
          title={t('retrospective.topHabitsTitle')}
          habits={metrics.topHabits}
          tone="default"
        />
      )}

      {metrics.needsAttention.length > 0 && (
        <HabitStatList
          title={t('retrospective.needsAttentionTitle')}
          habits={metrics.needsAttention}
          tone="attention"
        />
      )}

      <NarrativeSection
        icon={Star}
        title={t('retrospective.sections.highlights')}
        body={narrative.highlights}
      />
      <NarrativeSection
        icon={AlertTriangle}
        title={t('retrospective.sections.missed')}
        body={narrative.missed}
      />
      <NarrativeSection
        icon={TrendingUp}
        title={t('retrospective.sections.trends')}
        body={narrative.trends}
      />
      <NarrativeSection
        icon={Lightbulb}
        title={t('retrospective.sections.suggestion')}
        body={narrative.suggestion}
      />

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          lineHeight: 1.4,
          color: 'var(--fg-3)',
          marginTop: 4,
        }}
      >
        {t('aiDisclosure.notMedicalAdvice')}
      </p>
      {fromCache && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.02em',
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t('retrospective.cached')}
        </p>
      )}
    </div>
  )
}
