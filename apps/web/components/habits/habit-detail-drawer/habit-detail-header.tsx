import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface HabitDetailHeaderProps {
  habit: NormalizedHabit
  summaryStrip: string
}

export function HabitDetailHeader({
  habit,
  summaryStrip,
}: Readonly<HabitDetailHeaderProps>) {
  return (
    <span
      className="flex w-full flex-col items-center text-center"
      style={{ gap: 10, paddingTop: 8 }}
    >
      {habit.emoji ? (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 76,
            height: 76,
            borderRadius: 22,
            fontSize: 38,
            background: habit.isBadHabit
              ? 'color-mix(in srgb, var(--status-bad) 12%, transparent)'
              : 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
          }}
        >
          {habit.emoji}
        </span>
      ) : null}
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1.3,
          color: 'var(--fg-1)',
        }}
      >
        {habit.title}
      </span>
      {summaryStrip ? (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 400,
            color: habit.isBadHabit ? 'var(--status-bad)' : 'var(--fg-3)',
          }}
        >
          {summaryStrip}
        </span>
      ) : null}
      {habit.tags.length > 0 ? (
        <span className="flex flex-wrap items-center justify-center" style={{ gap: 8 }}>
          {habit.tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center" style={{ gap: 4 }}>
              <span
                aria-hidden="true"
                className="rounded-full shrink-0"
                style={{ width: 6, height: 6, background: tag.color }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--fg-3)',
                  lineHeight: 1.2,
                }}
              >
                {tag.name}
              </span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}
