import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { habitInitial } from '@orbit/shared/utils'

interface HabitRowLeadingProps {
  title: string
  emoji: NormalizedHabit['emoji']
  emojiSize: number
  wellSize: number
  wellRadius: number
}

export function HabitRowLeading({
  title,
  emoji,
  emojiSize,
  wellSize,
  wellRadius,
}: Readonly<HabitRowLeadingProps>) {
  return (
    <span className="flex w-[48px] shrink-0 items-center" aria-hidden="true">
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center"
        style={{
          width: wellSize,
          height: wellSize,
          borderRadius: wellRadius,
          background: 'var(--bg-well)',
          fontSize: emoji ? emojiSize : emojiSize === 16 ? 12 : 17,
          lineHeight: 1,
          ...(emoji
            ? {}
            : {
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                color: 'var(--fg-3)',
              }),
        }}
      >
        {emoji || habitInitial(title)}
      </span>
    </span>
  )
}
