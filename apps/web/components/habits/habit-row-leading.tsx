import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface HabitRowLeadingProps {
  title: string
  emoji: NormalizedHabit['emoji']
  emojiSize: number
  wellSize: number
  wellRadius: number
}

/** Emoji well. Disclosure and selection are structural sibling columns owned by the list. */
export function HabitRowLeading({
  title,
  emoji,
  emojiSize,
  wellSize,
  wellRadius,
}: Readonly<HabitRowLeadingProps>) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center"
      style={{
        width: wellSize,
        height: wellSize,
        borderRadius: wellRadius,
        background: 'var(--bg-well)',
        fontSize: emoji ? emojiSize : emojiSize - 4,
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
      {emoji ?? [...title.trim().toUpperCase()][0]}
    </span>
  )
}
